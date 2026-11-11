export type Connection = {url:string;key:string};
export function validateConnection(url: string,key: string): Connection {
  const u = new URL(url.trim());
  if (u.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(u.hostname) || u.username || u.password || u.port) throw new Error('Usa la URL HTTPS de tu proyecto Supabase (.supabase.co)');
  key=key.trim();
  if (!key.startsWith('sb_publishable_')) {
    try { const p=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if(p.role!=='anon') throw new Error(); }
    catch {throw new Error('Solo se admite la clave pública publishable / anon. Nunca service_role.');}
  }
  return {url:u.origin,key};
}
export function getConnection(): Connection | null {
 try {
   const saved=localStorage.getItem('zentry.connection.v2');
   if(saved) {const c=JSON.parse(saved);return validateConnection(c.url,c.key);}
   if(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return validateConnection(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
 } catch { /* Invalid configuration goes to setup, never to the old server. */ }
 return null;
}
