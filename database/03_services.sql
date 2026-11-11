BEGIN;
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
COMMIT;
