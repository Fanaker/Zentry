BEGIN;
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
