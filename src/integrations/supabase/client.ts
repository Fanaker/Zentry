import {createClient} from '@supabase/supabase-js';
import {getConnection} from '@/lib/connection';
const connection=getConnection();
// Setup is rendered before AuthProvider when no connection is configured.
export const supabase=createClient(connection?.url ?? 'https://unconfigured.supabase.co',connection?.key ?? 'not-configured',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
