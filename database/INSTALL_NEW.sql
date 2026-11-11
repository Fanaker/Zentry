-- NUEVO PROYECTO VACÍO. No ejecutar en Lovable existente.
BEGIN;
-- ONLY ON A NEW, EMPTY SUPABASE PROJECT. Then execute 02_hardening.sql.
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'viewer');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'); $$;

CREATE POLICY "Authenticated can view roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ ACCOUNTS ============
CREATE TYPE public.account_type AS ENUM ('debit', 'credit', 'cash', 'dollars', 'other');
CREATE TYPE public.currency_code AS ENUM ('PEN', 'USD');

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  account_type public.account_type NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'PEN',
  counts_as_real_money BOOLEAN NOT NULL DEFAULT true,
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ CATEGORIES ============
CREATE TYPE public.tx_type AS ENUM ('expense', 'income', 'transfer');

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tx_type public.tx_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, tx_type)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ PEOPLE ============
CREATE TABLE public.people (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read people" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write people" ON public.people FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_date DATE NOT NULL,
  tx_type public.tx_type NOT NULL,
  payment_account_id UUID REFERENCES public.accounts(id),
  origin_account_id UUID REFERENCES public.accounts(id),
  destination_account_id UUID REFERENCES public.accounts(id),
  person_id UUID REFERENCES public.people(id),
  category_id UUID REFERENCES public.categories(id),
  description TEXT,
  amount_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'PEN',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_date ON public.transactions(tx_date DESC);
CREATE INDEX idx_transactions_type ON public.transactions(tx_type);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_person ON public.transactions(person_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read transactions" ON public.transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ MONTHLY CLOSINGS ============
CREATE TABLE public.monthly_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  real_balance_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  real_balance_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, year, month)
);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read closings" ON public.monthly_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write closings" ON public.monthly_closings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ BUDGETS ============
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_pen NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, year, month)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read budgets" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write budgets" ON public.budgets FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
-- Backup history table to track export events
CREATE TABLE public.backup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  filename TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read backups"
ON public.backup_history FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins write backups"
ON public.backup_history FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_backup_history_created_at ON public.backup_history (created_at DESC);

ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS billing_start_day integer,
ADD COLUMN IF NOT EXISTS billing_end_day integer;

ALTER TABLE public.accounts
ADD CONSTRAINT accounts_billing_start_day_range CHECK (billing_start_day IS NULL OR (billing_start_day BETWEEN 1 AND 31)),
ADD CONSTRAINT accounts_billing_end_day_range CHECK (billing_end_day IS NULL OR (billing_end_day BETWEEN 1 AND 31));
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS hidden_in_accounts boolean NOT NULL DEFAULT false;
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['accounts','categories','people','transactions','budgets','monthly_closings','backup_history'] LOOP
EXECUTE format('ALTER TABLE public.%I ADD COLUMN owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)',t);
END LOOP; END $$;


-- New project after 01, OR a reviewed copy of the original schema. Never run blind on production.
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

CREATE OR REPLACE FUNCTION public.post_capture(p_id uuid,p_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.capture_drafts; tid uuid;
BEGIN
 SELECT * INTO d FROM public.capture_drafts WHERE id=p_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Borrador inexistente'; END IF;
 IF d.status='posted' THEN RETURN d.transaction_id; END IF;
 IF d.status<>'pending' THEN RAISE EXCEPTION 'El borrador fue descartado'; END IF;
 INSERT INTO public.transactions(owner_id,tx_date,tx_type,currency,amount_pen,amount_usd,payment_account_id,origin_account_id,destination_account_id,person_id,category_id,description,client_event_id,destination_amount,destination_currency,created_by)
 VALUES(auth.uid(),(p_payload->>'tx_date')::date,(p_payload->>'tx_type')::public.tx_type,(p_payload->>'currency')::public.currency_code,COALESCE((p_payload->>'amount_pen')::numeric,0),COALESCE((p_payload->>'amount_usd')::numeric,0),NULLIF(p_payload->>'payment_account_id','')::uuid,NULLIF(p_payload->>'origin_account_id','')::uuid,NULLIF(p_payload->>'destination_account_id','')::uuid,NULLIF(p_payload->>'person_id','')::uuid,NULLIF(p_payload->>'category_id','')::uuid,left(p_payload->>'description',500),p_id,NULLIF(p_payload->>'destination_amount','')::numeric,NULLIF(p_payload->>'destination_currency','')::public.currency_code,auth.uid()) RETURNING id INTO tid;
 UPDATE public.capture_drafts SET status='posted',transaction_id=tid,payload=p_payload,issues='[]' WHERE id=p_id;
 RETURN tid;
END $$;
CREATE OR REPLACE FUNCTION public.export_personal_backup() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE t text; result jsonb:='{}'; rows jsonb;
BEGIN
 IF NOT public.zentry_access() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 FOREACH t IN ARRAY ARRAY['accounts','categories','people','budgets','monthly_closings','transactions','backup_history','capture_drafts','import_batches'] LOOP
 EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id),''[]''::jsonb) FROM public.%I x WHERE owner_id=auth.uid()',t) INTO rows;
 result:=result||jsonb_build_object(t,rows);
 END LOOP;
 RETURN jsonb_build_object('format','zentry-personal','version',2,'exported_at',now(),'source_owner',auth.uid(),'tables',result);
END $$;
-- Restore only into an empty personal workspace. One SQL transaction; no destructive merge.
CREATE OR REPLACE FUNCTION public.restore_personal_backup(p_backup jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t text; row_data jsonb; cols text; vals text; defaults jsonb; n integer:=0; count_existing bigint;
BEGIN
 IF NOT public.zentry_access() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_backup->>'format'<>'zentry-personal' OR (p_backup->>'version')::int<>2 THEN RAISE EXCEPTION 'Formato de respaldo incompatible'; END IF;
 IF jsonb_typeof(p_backup->'tables') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Faltan tablas'; END IF;
 FOREACH t IN ARRAY ARRAY['accounts','categories','people','budgets','monthly_closings','transactions','backup_history','capture_drafts','import_batches'] LOOP
 IF jsonb_typeof(p_backup->'tables'->t) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Tabla ausente: %',t; END IF;
 EXECUTE format('SELECT count(*) FROM public.%I WHERE owner_id=auth.uid()',t) INTO count_existing;
 IF count_existing>0 THEN RAISE EXCEPTION 'La restauración requiere un espacio vacío: % tiene registros',t; END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounts','categories','people','budgets','monthly_closings','transactions','backup_history','capture_drafts','import_batches'] LOOP
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_backup->'tables'->t) ORDER BY CASE WHEN t='transactions' THEN value->>'tx_date' ELSE '' END,CASE WHEN t='transactions' AND value->>'tx_type'='expense' THEN 0 ELSE 1 END,value->>'created_at',value->>'id' LOOP
 row_data:=row_data||jsonb_build_object('owner_id',auth.uid());
 IF t='transactions' THEN row_data:=row_data||jsonb_build_object('created_by',auth.uid()); END IF;
 IF t='backup_history' THEN row_data:=row_data||jsonb_build_object('created_by',auth.uid()); END IF;
 SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',t,column_name),',' ORDER BY ordinal_position) INTO cols,vals FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND row_data ? column_name;
 EXECUTE format('INSERT INTO public.%I(%s) SELECT %s',t,cols,vals) USING row_data;
 n:=n+1;
 END LOOP;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.post_capture(uuid,jsonb), public.export_personal_backup(),public.restore_personal_backup(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_capture(uuid,jsonb),public.export_personal_backup(),public.restore_personal_backup(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_excel(p_rows jsonb,p_source_hash text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb; pay uuid; ori uuid; dest uuid; cat uuid; person uuid; typ public.tx_type; cur public.currency_code; nm text; aid uuid; i integer:=0;
BEGIN
 IF NOT public.zentry_access() THEN RAISE EXCEPTION 'Acceso no autorizado'; END IF;
 IF p_source_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>50000 THEN RAISE EXCEPTION 'Archivo inválido o demasiado grande'; END IF;
 -- Serialize imports for this owner; protects repeated uploads and entity creation.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM public.import_batches WHERE owner_id=auth.uid() AND source_hash=p_source_hash) THEN RAISE EXCEPTION 'Este archivo ya fue importado'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
 i:=i+1; pay:=NULL;ori:=NULL;dest:=NULL;cat:=NULL;person:=NULL;
 typ:=(r->>'tx_type')::public.tx_type;cur:=(r->>'currency')::public.currency_code;
 FOREACH nm IN ARRAY ARRAY[NULLIF(r->>'payment_account',''),NULLIF(r->>'origin_account',''),NULLIF(r->>'destination_account','')] LOOP
 IF nm IS NOT NULL THEN
 SELECT id INTO aid FROM public.accounts WHERE owner_id=auth.uid() AND lower(name)=lower(nm);
 IF aid IS NULL THEN
 INSERT INTO public.accounts(owner_id,name,account_type,currency,counts_as_real_money) VALUES(auth.uid(),nm,CASE WHEN lower(nm)='efectivo' THEN 'cash'::public.account_type WHEN lower(nm) ~ '(visa|mastercard|amex|credito|crédito)' OR nm LIKE 'C.%' THEN 'credit'::public.account_type ELSE 'debit'::public.account_type END,CASE WHEN lower(nm) ~ '(dolar|dólar|usd)' THEN 'USD'::public.currency_code ELSE cur END,nm NOT IN ('Negocio Papá','Otros - Exterior')) RETURNING id INTO aid;
 END IF;
 IF nm=r->>'payment_account' THEN pay:=aid;END IF;
 IF nm=r->>'origin_account' THEN ori:=aid;END IF;
 IF nm=r->>'destination_account' THEN dest:=aid;END IF;
 END IF;
 END LOOP;
 IF NULLIF(r->>'category','') IS NOT NULL THEN
 SELECT id INTO cat FROM public.categories WHERE owner_id=auth.uid() AND lower(name)=lower(r->>'category') AND tx_type=typ;
 IF cat IS NULL THEN INSERT INTO public.categories(owner_id,name,tx_type) VALUES(auth.uid(),r->>'category',typ) RETURNING id INTO cat;END IF;
 END IF;
 IF NULLIF(r->>'person','') IS NOT NULL AND upper(r->>'person')<>'ND' THEN
 SELECT id INTO person FROM public.people WHERE owner_id=auth.uid() AND lower(name)=lower(r->>'person');
 IF person IS NULL THEN INSERT INTO public.people(owner_id,name) VALUES(auth.uid(),r->>'person') RETURNING id INTO person;END IF;
 END IF;
 BEGIN
 INSERT INTO public.transactions(owner_id,tx_date,tx_type,currency,amount_pen,amount_usd,payment_account_id,origin_account_id,destination_account_id,person_id,category_id,description,created_by)
 VALUES(auth.uid(),(r->>'tx_date')::date,typ,cur,(r->>'amount_pen')::numeric,(r->>'amount_usd')::numeric,pay,ori,dest,person,cat,r->>'description',auth.uid());
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Fila %: %. Se revirtió toda la importación.',i,SQLERRM;
 END;
 END LOOP;
 INSERT INTO public.import_batches(owner_id,source_hash,record_count) VALUES(auth.uid(),p_source_hash,i);
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.import_excel(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_excel(jsonb,text) TO authenticated;

COMMIT;
