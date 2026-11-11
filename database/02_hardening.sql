-- New project after 01, OR a reviewed copy of the original schema. Never run blind on production.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_access (owner_id uuid PRIMARY KEY REFERENCES auth.users(id), enabled boolean NOT NULL DEFAULT true, require_mfa boolean NOT NULL DEFAULT false);
ALTER TABLE public.app_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_access FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.zentry_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM public.app_access a WHERE a.owner_id=auth.uid() AND a.enabled AND (NOT a.require_mfa OR auth.jwt()->>'aal'='aal2'));
$$;
REVOKE ALL ON FUNCTION public.zentry_access() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.zentry_access() TO authenticated;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS day_order integer;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_event_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS destination_amount numeric(14,2);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS destination_currency public.currency_code;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_owner_event ON public.transactions(owner_id,client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_date_order_idx ON public.transactions(owner_id,tx_date,day_order,id);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS system_code text;
UPDATE public.categories SET system_code=CASE WHEN name='Préstamos / Deudas' AND tx_type='expense' THEN 'loan_given' WHEN name='Deudas Cobradas' AND tx_type='income' THEN 'loan_repayment' WHEN name='Deuda Condonada' AND tx_type='income' THEN 'debt_settled' END WHERE system_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_owner_code ON public.categories(owner_id,system_code) WHERE system_code IS NOT NULL;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_name_key;
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_name_key;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_tx_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_name ON public.accounts(owner_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS people_owner_name ON public.people(owner_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS categories_owner_name_type ON public.categories(owner_id,name,tx_type);
CREATE TABLE IF NOT EXISTS public.capture_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 transcript text NOT NULL DEFAULT '', payload jsonb NOT NULL DEFAULT '{}', issues jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','discarded')),
 transaction_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.import_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),source_hash text NOT NULL,record_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,source_hash));
-- Rebuild policies; all API tables require explicitly provisioned access.
DO $$ DECLARE t text; p record; BEGIN
FOREACH t IN ARRAY ARRAY['accounts','categories','people','transactions','budgets','monthly_closings','backup_history','capture_drafts','import_batches'] LOOP
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t); END LOOP;
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_access ON public.%I FOR ALL TO authenticated USING(owner_id=auth.uid() AND public.zentry_access()) WITH CHECK(owner_id=auth.uid() AND public.zentry_access())',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(owner_id)',t||'_owner_idx',t);
END LOOP;
FOREACH t IN ARRAY ARRAY['profiles','user_roles'] LOOP
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t); END LOOP;
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
END LOOP;
END $$;
CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY own_role ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
-- Compound foreign keys prohibit cross-owner links, even outside the forms.
DO $$ DECLARE t text; spec text[]; parts text[]; constraint_name text; BEGIN
FOREACH t IN ARRAY ARRAY['accounts','categories','people'] LOOP EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(id,owner_id)',t||'_id_owner',t); END LOOP;
FOREACH spec SLICE 1 IN ARRAY ARRAY[
 ARRAY['transactions','payment_account_id','accounts'],ARRAY['transactions','origin_account_id','accounts'],ARRAY['transactions','destination_account_id','accounts'],ARRAY['transactions','category_id','categories'],ARRAY['transactions','person_id','people'],ARRAY['budgets','category_id','categories'],ARRAY['monthly_closings','account_id','accounts']
] LOOP
constraint_name:=spec[1]||'_'||spec[2]||'_same_owner';
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=constraint_name) THEN
 EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(%I,owner_id) REFERENCES public.%I(id,owner_id) NOT VALID',spec[1],constraint_name,spec[2],spec[3]);
END IF;
END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.validate_zentry_transaction() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cat public.categories; a public.accounts; b public.accounts; pending numeric;
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.owner_id<>auth.uid() THEN RAISE EXCEPTION 'Propietario inválido'; END IF;
 IF NEW.amount_pen::text='NaN' OR NEW.amount_usd::text='NaN' OR NEW.destination_amount::text='NaN' THEN RAISE EXCEPTION 'Importe no finito'; END IF;
 IF NEW.amount_pen<0 OR NEW.amount_usd<0 OR NEW.amount_pen+NEW.amount_usd<=0 THEN RAISE EXCEPTION 'El importe debe ser positivo'; END IF;
 -- Historical imported records with both columns are preserved; ordinary new entries use one currency.
 IF (NEW.currency='PEN' AND NEW.amount_usd<>0) OR (NEW.currency='USD' AND NEW.amount_pen<>0) THEN RAISE EXCEPTION 'Un importe debe pertenecer a su moneda de origen'; END IF;
 IF NEW.category_id IS NOT NULL THEN
 SELECT * INTO cat FROM public.categories WHERE id=NEW.category_id AND owner_id=NEW.owner_id;
 IF NOT FOUND OR cat.tx_type<>NEW.tx_type THEN RAISE EXCEPTION 'Categoría incompatible'; END IF;
 END IF;
 IF NEW.tx_type='transfer' THEN
  IF NEW.payment_account_id IS NOT NULL OR NEW.origin_account_id IS NULL OR NEW.destination_account_id IS NULL OR NEW.origin_account_id=NEW.destination_account_id THEN RAISE EXCEPTION 'Origen y destino distintos requeridos'; END IF;
  SELECT * INTO a FROM public.accounts WHERE id=NEW.origin_account_id AND owner_id=NEW.owner_id;
  SELECT * INTO b FROM public.accounts WHERE id=NEW.destination_account_id AND owner_id=NEW.owner_id;
  IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Cuenta ajena o inexistente'; END IF;
  IF a.currency IS DISTINCT FROM NEW.currency THEN RAISE EXCEPTION 'La moneda no coincide con origen'; END IF;
  IF a.currency=b.currency THEN NEW.destination_amount:=NULL;NEW.destination_currency:=NULL;END IF;
  IF a.currency<>b.currency AND (NEW.destination_amount IS NULL OR NEW.destination_amount<=0 OR NEW.destination_currency IS DISTINCT FROM b.currency) THEN RAISE EXCEPTION 'Cambio de moneda: indica importe recibido y moneda de destino'; END IF;
 ELSE
  IF NEW.origin_account_id IS NOT NULL OR NEW.destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'Una entrada o salida no es transferencia'; END IF;
  IF NEW.payment_account_id IS NULL THEN
   IF NEW.person_id IS NULL OR ((NEW.tx_type='expense' AND cat.system_code='loan_given') OR (NEW.tx_type='income' AND cat.system_code='debt_settled')) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Falta cuenta de pago'; END IF;
  ELSE
   SELECT * INTO a FROM public.accounts WHERE id=NEW.payment_account_id AND owner_id=NEW.owner_id;
   IF a.id IS NULL OR a.currency<>NEW.currency THEN RAISE EXCEPTION 'Cuenta o moneda incompatible'; END IF;
   IF cat.system_code='debt_settled' THEN RAISE EXCEPTION 'Condonar no genera ingreso de dinero'; END IF;
  END IF;
  IF cat.system_code IS NOT NULL AND NEW.person_id IS NULL THEN RAISE EXCEPTION 'Selecciona persona'; END IF;
  IF cat.system_code='debt_settled' THEN
   PERFORM 1 FROM public.people WHERE id=NEW.person_id AND owner_id=NEW.owner_id FOR UPDATE;
   SELECT COALESCE(sum(CASE c.system_code WHEN 'loan_given' THEN t.amount_pen WHEN 'loan_repayment' THEN -t.amount_pen WHEN 'debt_settled' THEN -t.amount_pen ELSE 0 END),0) INTO pending FROM public.transactions t JOIN public.categories c ON c.id=t.category_id WHERE t.owner_id=NEW.owner_id AND t.person_id=NEW.person_id AND t.id<>NEW.id;
   IF NEW.currency<>'PEN' OR NEW.amount_pen>pending THEN RAISE EXCEPTION 'La condonación supera el saldo pendiente en soles'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zentry_validate_tx ON public.transactions;
CREATE TRIGGER zentry_validate_tx BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_zentry_transaction();
-- Names can change; system meanings survive. Newly created reserved names get a code.
CREATE OR REPLACE FUNCTION public.zentry_category_code() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
IF TG_OP='UPDATE' AND OLD.system_code IS NOT NULL THEN NEW.system_code:=OLD.system_code;
ELSIF NEW.system_code IS NULL THEN NEW.system_code:=CASE WHEN NEW.name='Préstamos / Deudas' AND NEW.tx_type='expense' THEN 'loan_given' WHEN NEW.name='Deudas Cobradas' AND NEW.tx_type='income' THEN 'loan_repayment' WHEN NEW.name='Deuda Condonada' AND NEW.tx_type='income' THEN 'debt_settled' END; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS zentry_category_semantics ON public.categories;
CREATE TRIGGER zentry_category_semantics BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.zentry_category_code();
-- Legacy administration RPCs must not be exposed by the personal app.
DO $$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('admin_list_users','admin_delete_user','handle_new_user') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); END LOOP; END $$;
COMMIT;
