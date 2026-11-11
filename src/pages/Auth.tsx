import {useState,useEffect} from 'react';
import {readRememberedEmail} from '@/lib/deviceLock';
import {supabase} from '@/integrations/supabase/client';
import {useNavigate} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
export default function Auth(){
 const navigate=useNavigate();const [email,setEmail]=useState(readRememberedEmail),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(data.session)navigate('/');});},[navigate]);
 return <main className="min-h-screen grid place-items-center p-6"><form className="glass-card-elevated p-7 w-full max-w-sm space-y-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)setError('No se pudo iniciar sesión. Comprueba tus datos.');else navigate('/');}}>
 <p className="text-xs uppercase tracking-widest text-primary">Zentry · Fanaker</p><h1 className="text-3xl font-bold">Tu espacio financiero</h1><p className="text-sm text-muted-foreground">Acceso privado. El registro público está cerrado.</p><div><Label htmlFor="email">Correo</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div><Label htmlFor="pass">Contraseña</Label><Input id="pass" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button className="w-full" disabled={busy}>{busy?'Entrando…':'Entrar'}</Button><Button type="button" variant="ghost" className="w-full" onClick={()=>{localStorage.removeItem('zentry.connection.v2');location.reload();}}>Cambiar conexión</Button></form></main>;
}
