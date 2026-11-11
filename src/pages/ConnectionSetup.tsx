import {useState} from 'react';
import {validateConnection} from '@/lib/connection';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
export default function ConnectionSetup(){
 const [url,setUrl]=useState(''),[key,setKey]=useState(''),[error,setError]=useState('');
 return <main className="min-h-screen grid place-items-center p-6"><form className="glass-card-elevated w-full max-w-lg p-7 space-y-5" onSubmit={e=>{e.preventDefault();try {const c=validateConnection(url,key);localStorage.setItem('zentry.connection.v2',JSON.stringify(c));location.reload();}catch(err){setError(err.message);}}}>
 <p className="text-xs uppercase tracking-widest text-primary">Fanaker · Zentry 2</p><h1 className="text-3xl font-bold">Conecta tu espacio</h1><p className="text-sm text-muted-foreground">Usa el mismo proyecto de Supabase que ya tienes conectado en el APK para abrir tus datos en la web.</p>
 <div><Label htmlFor="server">URL del proyecto</Label><Input id="server" required type="url" placeholder="https://tu-proyecto.supabase.co" value={url} onChange={e=>setUrl(e.target.value)}/></div>
 <div><Label htmlFor="key">Clave pública publishable / anon</Label><Input id="key" required value={key} onChange={e=>setKey(e.target.value)} autoComplete="off"/></div>
 <p className="text-xs text-muted-foreground">La clave pública identifica el proyecto. Tu sesión y las políticas del servidor protegen los datos.</p>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button className="w-full">Guardar conexión</Button></form></main>;
}
