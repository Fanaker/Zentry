import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
export default function SecurityTools(){
 const [enroll,setEnroll]=useState<any>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
 return <section className="glass-card p-5 space-y-3"><h2 className="font-semibold">Seguridad de acceso</h2><p className="text-sm text-muted-foreground">Configura un autenticador para proteger tu cuenta con un segundo factor.</p><Button disabled={busy} onClick={async()=>{setBusy(true);try{const factors=await supabase.auth.mfa.listFactors();if(factors.error)throw factors.error;if(factors.data.totp.some(f=>f.status==='verified')){toast.info('Tu autenticador ya está configurado');return;}const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Zentry personal'});if(error)throw error;setEnroll(data);}catch(e){toast.error(e.message);}finally{setBusy(false);}}}>Configurar autenticador</Button>{enroll&&<div className="space-y-3"><img className="w-48 bg-white p-2" src={enroll.totp.qr_code} alt="Código QR para tu autenticador"/><p className="text-xs break-all">Clave manual: {enroll.totp.secret}</p><Input aria-label="Código del autenticador" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)}/><Button disabled={busy} onClick={async()=>{setBusy(true);const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:enroll.id,code});setBusy(false);if(error)toast.error(error.message);else{setEnroll(null);setCode('');toast.success('Autenticador verificado');}}}>Verificar código</Button></div>}</section>;
}
