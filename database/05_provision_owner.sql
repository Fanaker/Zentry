-- Create your user in Supabase Authentication > Users first.
-- Disable public signups in Authentication settings. This script grants no access until
-- the placeholder is replaced with YOUR verified user's UUID. Never choose the first signup.
BEGIN;
DO $$ DECLARE owner_uuid uuid := '00000000-0000-0000-0000-000000000000'; BEGIN
 IF owner_uuid='00000000-0000-0000-0000-000000000000' THEN RAISE EXCEPTION 'Reemplaza el UUID por el de tu usuario'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner_uuid) THEN RAISE EXCEPTION 'Primero crea el usuario'; END IF;
 INSERT INTO public.app_access(owner_id) VALUES(owner_uuid) ON CONFLICT(owner_id) DO UPDATE SET enabled=true;
 INSERT INTO public.profiles(id,display_name) VALUES(owner_uuid,'Fanaker') ON CONFLICT(id) DO NOTHING;
END $$;
COMMIT;
-- After enrolling/verifying your authenticator, you can also enforce MFA in API policies:
-- UPDATE public.app_access SET require_mfa=true WHERE owner_id='YOUR-UUID';
-- Suspending access without deleting financial data:
-- UPDATE public.app_access SET enabled=false WHERE owner_id='YOUR-UUID';
