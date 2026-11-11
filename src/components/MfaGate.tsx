import {useEffect,useState,ReactNode} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export default function MfaGate({children}:{children:ReactNode}){
 const [state,setState]=useState<'loading'|'ready'|'challenge'|'error'>('loading'),[code,setCode]=useState(''),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({data,error})=>{if(error){setError(error.message);setState('error');}else setState(data?.nextLevel==='aal2'&&data.currentLevel!=='aal2'?'challenge':'ready');});},[]);
 async function verify(){try{const {data,error}=await supabase.auth.mfa.listFactors();if(error)throw error;const factor=data.totp.find(f=>f.status==='verified');if(!factor)throw new Error('No hay un factor disponible');const res=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(res.error)throw res.error;setState('ready');}catch(e){setError(e.message);}}
 if(state==='ready')return children;
 return <main className="max-w-md mx-auto p-8 space-y-4"><h1 className="text-2xl">Verifica tu acceso</h1>{state==='loading'?<p>Comprobando sesión…</p>:<><p>Introduce el código de tu aplicación autenticadora.</p><Input aria-label="Código de verificación" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/><Button onClick={verify}>Verificar</Button></>}{error&&<p role="alert">{error}</p>}<Button variant="outline" onClick={()=>supabase.auth.signOut().then(()=>location.reload())}>Cerrar sesión</Button></main>;
}
