import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,Mic,Pencil,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {useAuth} from '@/hooks/useAuth';
import {useAccounts,useCategories,usePeople} from '@/hooks/useFinanceData';
import {useCaptureAliases} from '@/hooks/useCaptureAliases';
import {supabase} from '@/integrations/supabase/client';
import {collectPages} from '@/lib/pagination';
import {planCapture} from '@/lib/captureBatch';
import {normalize,type VoiceAlias} from '@/lib/voiceParser';
import {categoryCode,validateMovement} from '@/lib/transactionRules';
import {removeLegacyModels} from '@/lib/legacyModelCleanup';
import {hasNativeVoice} from '@/lib/native';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

type Draft = {id:string;transcript:string;payload:any;issues:string[]};
const cleanupKey='zentry.legacy-models-cleaned.v1';
const selectClass='mt-1 w-full min-w-0 rounded-md border bg-background p-2 text-sm';

export default function Capturas(){
 const {user}=useAuth();
 const client=useQueryClient();
 const {data:accounts=[]}=useAccounts(),{data:categories=[]}=useCategories(),{data:people=[]}=usePeople();
 const userId=user?.id??'';
 const {aliases,synced,loading:aliasLoading,localCount,syncLocal,save,remove}=useCaptureAliases(userId);
 const location=useLocation(),navigate=useNavigate();
 const textInput=useRef<HTMLTextAreaElement>(null);
 const lastVoiceRequest=useRef<string>();
 const inFlight=useRef(false);
 const retryKey='zentry.voice.'+userId+'.retry';
 const [text,setText]=useState(()=>{
  try{return JSON.parse(localStorage.getItem(retryKey)??'null')?.text??'';}catch{return '';}
 });
 const [preview,setPreview]=useState<Draft[]>([]);
 const [editing,setEditing]=useState<{row:Draft;local:boolean;mode:'accept'|'edit'}|null>(null);
 const [busy,setBusy]=useState(false);
 const [phrase,setPhrase]=useState('');
 const [aliasTarget,setAliasTarget]=useState('');
 const [cleaned,setCleaned]=useState(()=>localStorage.getItem(cleanupKey)==='true');
 const drafts=useQuery({
  queryKey:['capture_drafts',userId],enabled:!!userId,refetchInterval:30000,
  queryFn:()=>collectPages<Draft>((from,to)=>(supabase as any).from('capture_drafts')
    .select('id,transcript,payload,issues').eq('status','pending').order('created_at',{ascending:false}).order('id').range(from,to)),
 });

 function openKeyboard(){
  textInput.current?.focus();
  window.ZentryAndroid?.showKeyboard?.();
 }

 useEffect(()=>{
  const request=location.state?.voiceRequest;
  if(typeof request!=='string'||lastVoiceRequest.current===request)return;
  lastVoiceRequest.current=request;
  navigate(location.pathname,{replace:true,state:null});
  requestAnimationFrame(openKeyboard);
 },[location.pathname,location.state,navigate]);

 async function run(work:()=>Promise<void>) {
  if(inFlight.current)return;
  inFlight.current=true;
  setBusy(true);
  try {await work();}
  catch(error){toast.error(error?.message??'No se pudo completar la operación.');}
  finally{inFlight.current=false;setBusy(false);}
 }

 function refresh(){
  void client.invalidateQueries({queryKey:['capture_drafts',userId]});
  void client.invalidateQueries({queryKey:['transactions']});
 }

 function prepare(){
  if(!text.trim()||inFlight.current)return;
  const plan=planCapture(text,accounts,categories,people,aliases);
  let previous:any;
  try{previous=JSON.parse(localStorage.getItem(retryKey)??'null');}catch{previous=null;}
  if(previous?.text===text&&Array.isArray(previous.rows)&&previous.rows.length){
   setPreview(previous.rows);
   return;
  }
  const fragments=plan.map(item=>item.transcript);
  const oldIds=previous?.text===text
   ? (JSON.stringify(previous.fragments)===JSON.stringify(fragments)?previous.ids:plan.length===1&&previous.id?[previous.id]:null)
   : null;
  setPreview(plan.map((item,index)=>({
   id:oldIds?.[index]??crypto.randomUUID(),transcript:item.transcript,payload:item.payload,issues:item.issues,
  })));
 }

 async function persist(rows:Draft[]){
  const {error}=await (supabase as any).from('capture_drafts').upsert(rows,{onConflict:'id',ignoreDuplicates:true});
  if(error)throw error;
 }

 function keepRetry(rows:Draft[]){
  localStorage.setItem(retryKey,JSON.stringify({text,rows}));
 }

 function removePreview(ids:string[]){
  const left=preview.filter(row=>!ids.includes(row.id));
  setPreview(left);
  if(left.length)keepRetry(left);
  else {localStorage.removeItem(retryKey);setText('');}
 }

 function savePreview(){
  void run(async()=>{
   keepRetry(preview);
   await persist(preview);
   removePreview(preview.map(row=>row.id));
   refresh();
   toast.success('Guardado en Por confirmar');
  });
 }

 function saveChanges(){
  if(!editing)return;
  const {row,local}=editing;
  const updated={...row,issues:validateMovement(row.payload,accounts,categories)};
  void run(async()=>{
   if(local){
    const next=preview.map(item=>item.id===row.id?updated:item);
    keepRetry(next);
    setPreview(next);
   } else {
    const {data,error}=await (supabase as any).from('capture_drafts')
     .update({payload:updated.payload,issues:updated.issues}).eq('id',row.id).eq('status','pending').select('id').maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Este borrador ya se resolvió en otro dispositivo.');
    refresh();
   }
   setEditing(null);
   toast.success('Borrador actualizado');
  });
 }

 function confirmMovement(){
  if(!editing)return;
  const {row,local}=editing;
  const issues=validateMovement(row.payload,accounts,categories);
  if(row.payload.tx_type!=='transfer'&&!row.payload.category_id)issues.push('Selecciona una categoría');
  if(issues.length){toast.error(issues.join(' · '));return;}
  void run(async()=>{
   if(local){
    keepRetry(preview.map(item=>item.id===row.id?row:item));
    await persist([row]);
   }
   const {error}=await (supabase as any).rpc('post_capture',{p_id:row.id,p_payload:row.payload});
   if(error)throw error;
   if(local)removePreview([row.id]);
   setEditing(null);
   refresh();
   toast.success('Movimiento registrado');
  });
 }

 function discard(row:Draft,local:boolean){
  if(inFlight.current||!window.confirm('¿Descartar este movimiento pendiente?'))return;
  void run(async()=>{
   // A failed network response can leave a local preview already persisted on the server.
   const {error}=await (supabase as any).from('capture_drafts').update({status:'discarded'}).eq('id',row.id).eq('status','pending');
   if(error)throw error;
   if(local)removePreview([row.id]);
   refresh();
   toast.success('Movimiento descartado');
  });
 }

 function edit(row:Draft,local:boolean,mode:'accept'|'edit'){setEditing({row:{...row,payload:{...row.payload}},local,mode});}

 function renderDraft(row:Draft,local:boolean){
  const {payload}=row;
  const category=categories.find(item=>item.id===payload.category_id);
  const account=accounts.find(item=>item.id===payload.payment_account_id);
  const person=people.find(item=>item.id===payload.person_id);
  const kind=categoryCode(category)==='loan_given'?'Préstamo':payload.tx_type==='expense'?'Gasto':payload.tx_type==='income'?'Ingreso':'Transferencia';
  const amount=Number(payload.amount_pen||payload.amount_usd||0);
  return <article key={row.id} className="min-w-0 space-y-3 rounded-xl border border-border/70 bg-card p-4">
   <div className="flex flex-wrap items-baseline justify-between gap-2">
    <h3 className="min-w-0 break-words text-base font-semibold">{payload.description||'Movimiento sin descripción'}</h3>
    <span className="font-semibold tabular-nums text-primary">{amount>0?`${payload.currency==='USD'?'US$':'S/'} ${amount.toFixed(2)}`:'Importe pendiente'}</span>
   </div>
   <p className="break-words text-sm text-muted-foreground">{[kind,person?.name,payload.tx_date,category?.name,account?.name].filter(Boolean).join(' · ')}</p>
   {row.issues.length>0&&<p className="break-words text-sm text-warning">{row.issues.join(' · ')}</p>}
   <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Ver texto original</summary><p className="mt-2 whitespace-pre-wrap break-words">{row.transcript}</p></details>
   <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
    <Button className="col-span-2 gap-2" disabled={busy} onClick={()=>edit(row,local,'accept')}><Check className="h-4 w-4 shrink-0"/>Aceptar movimiento</Button>
    <Button variant="outline" className="gap-2" disabled={busy} onClick={()=>edit(row,local,'edit')}><Pencil className="h-4 w-4 shrink-0"/>Editar</Button>
    <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" disabled={busy} onClick={()=>discard(row,local)}><Trash2 className="h-4 w-4 shrink-0"/>Descartar</Button>
   </div>
  </article>;
 }

 function change(values:Record<string,unknown>){
  setEditing(current=>current?{...current,row:{...current.row,payload:{...current.row.payload,...values}}}:null);
 }

 const payload=editing?.row.payload;
 const activeAccounts=accounts.filter(account=>account.is_active);
 const paymentAccounts=activeAccounts.filter(account=>account.currency===payload?.currency);
 function field(label:string,key:string,items:{id:string;name:string}[]){
  return <label className="block min-w-0 text-sm">{label}<select className={selectClass}
   value={payload?.[key]??''} onChange={event=>change({[key]:event.target.value||null})}>
   <option value="">Seleccionar</option>{items.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
  </select></label>;
 }

 return <div className="mx-auto max-w-5xl space-y-6 pb-24">
  <header><h1 className="text-2xl font-bold">Por confirmar</h1>
   <p className="mt-1 text-sm text-muted-foreground">Completa los campos y confirma cada movimiento para registrarlo.</p></header>
  <section className="glass-card space-y-4 p-4 sm:p-6">
   <h2 className="text-lg font-semibold">Capturar movimiento</h2>
   <Button type="button" variant="outline" disabled={busy} onClick={openKeyboard} className="gap-2">
    <Mic className="h-4 w-4"/>Dictar con el teclado
   </Button>
   <p className="text-sm text-muted-foreground">Toca el micrófono de Gboard para dictar. También puedes escribir o pegar el texto.</p>
   <Textarea ref={textInput} aria-label="Texto del movimiento" disabled={busy} rows={4} value={text}
    placeholder="Gasté un sol veinte con metro uni por pasaje a la UPC"
    onChange={event=>{setText(event.target.value);setPreview([]);}}/>
   <Button type="button" disabled={busy||!text.trim()} onClick={prepare}>Completar formulario</Button>
   {preview.length>0&&<div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h3 className="font-semibold">Vista previa · {preview.length} {preview.length===1?'movimiento':'movimientos'}</h3>
     <Button variant="secondary" disabled={busy} onClick={savePreview}>Guardar para revisar</Button>
    </div>
    {preview.map(row=>renderDraft(row,true))}
   </div>}
  </section>
  <details className="glass-card p-4 sm:p-6">
   <summary className="cursor-pointer text-base font-semibold">Aprender mis frases</summary>
   <div className="mt-4 space-y-3">
    <p className="text-sm text-muted-foreground">Vincula una frase habitual con una cuenta o categoría. Puedes asociar varias frases al mismo destino.</p>
    <p className="text-xs text-muted-foreground">Atajos iniciales: «pasaje a» → Movilidad; «metropolitano universitario», «metro uni» y «metro universitario» → Metropolitano Univ, si existen en tu catálogo.</p>
    <div className="grid gap-2 sm:grid-cols-2">
     <Input aria-label="Frase del alias" placeholder="Ej. pasaje a" value={phrase} maxLength={80} onChange={event=>setPhrase(event.target.value)}/>
     <select aria-label="Destino del alias" className={selectClass} value={aliasTarget} onChange={event=>setAliasTarget(event.target.value)}>
      <option value="">Seleccionar cuenta o categoría</option>
      <optgroup label="Cuentas">{activeAccounts.map(a=><option key={a.id} value={'account:'+a.id}>{a.name}</option>)}</optgroup>
      <optgroup label="Categorías">{categories.filter(c=>c.is_active).map(c=><option key={c.id} value={'category:'+c.id}>{c.name} · {c.tx_type}</option>)}</optgroup>
     </select>
    </div>
    <Button variant="outline" disabled={busy||aliasLoading||!normalize(phrase)||!aliasTarget} onClick={()=>void run(async()=>{
     const [kind,id]=aliasTarget.split(':') as [VoiceAlias['field'],string];
     await save({phrase:phrase.trim(),field:kind,id});
     setPhrase('');setAliasTarget('');toast.success('Frase guardada');
    })}>Guardar frase</Button>
    <p className="text-xs text-muted-foreground">{synced?'Los alias nuevos se sincronizan con Supabase.':'Los alias se guardan en este dispositivo.'}</p>
    {synced&&localCount>0&&<Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{
     await syncLocal();
     toast.success('Alias locales sincronizados');
    })}>Sincronizar mis frases locales</Button>}
    {aliases.map(alias=><div key={alias.field+':'+normalize(alias.phrase)} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
     <span className="min-w-0 break-words">{alias.phrase} → {(alias.field==='account'?accounts:categories).find(item=>item.id===alias.id)?.name??'Destino no disponible'}</span>
     <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" disabled={busy} onClick={()=>{setPhrase(alias.phrase);setAliasTarget(alias.field+':'+alias.id);}}>Editar</Button>
      <Button variant="ghost" size="sm" disabled={busy||aliasLoading} onClick={()=>void run(()=>remove(alias))}>Quitar</Button>
     </div>
    </div>)}
   </div>
  </details>
  {hasNativeVoice()&&window.ZentryAndroid?.removeLegacyModels&&!cleaned&&<section className="glass-card space-y-2 p-4 sm:p-6">
   <h2 className="font-semibold">Almacenamiento anterior</h2>
   <p className="text-sm text-muted-foreground">Libera el espacio de Whisper y Qwen que descargaste en versiones anteriores.</p>
   <Button variant="outline" disabled={busy} onClick={()=>{
    if(window.confirm('¿Eliminar los modelos anteriores de este teléfono? Tus movimientos y borradores se conservan.'))void run(async()=>{
     await removeLegacyModels();localStorage.setItem(cleanupKey,'true');setCleaned(true);toast.success('Modelos anteriores eliminados');
    });
   }}>Limpiar modelos anteriores</Button>
  </section>}
  <section className="space-y-3">
   <h2 className="text-lg font-semibold">Borradores guardados</h2>
   {drafts.isError?<p role="alert">No se pudieron cargar los borradores.</p>:drafts.isPending?<p>Cargando…</p>
    :drafts.data.length===0?<p className="glass-card p-4 text-muted-foreground">No hay movimientos por confirmar.</p>
    :drafts.data.map(row=>renderDraft(row,false))}
  </section>
  <Dialog open={!!editing} onOpenChange={open=>{if(!open&&!busy)setEditing(null);}}>
   <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto rounded-xl">
    <DialogHeader><DialogTitle>{editing?.mode==='edit'?'Editar borrador':'Revisar movimiento'}</DialogTitle><DialogDescription>{editing?.mode==='edit'?'Guarda los cambios para revisar el movimiento después.':'Revisa el importe y los datos antes de registrarlo.'}</DialogDescription></DialogHeader>
    {payload&&<form className="space-y-4" onSubmit={event=>{event.preventDefault();if(editing.mode==='edit')saveChanges();else confirmMovement();}}>
     <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="text-sm">Importe<Input className="mt-1" type="number" inputMode="decimal" min="0.01" step="0.01"
       value={(payload.currency==='USD'?payload.amount_usd:payload.amount_pen)||''}
       onChange={event=>change({[payload.currency==='USD'?'amount_usd':'amount_pen']:Number(event.target.value)})}/></label>
      <label className="text-sm">Moneda<select className={selectClass} value={payload.currency} onChange={event=>{
       const amount=Number(payload.amount_pen||payload.amount_usd||0);
       change({currency:event.target.value,amount_pen:event.target.value==='PEN'?amount:0,amount_usd:event.target.value==='USD'?amount:0,payment_account_id:null});
      }}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
      <label className="text-sm">Fecha<Input className="mt-1" type="date" value={payload.tx_date} onChange={event=>change({tx_date:event.target.value})}/></label>
      <label className="text-sm">Tipo<select className={selectClass} value={payload.tx_type} onChange={event=>change({
       tx_type:event.target.value,payment_account_id:null,origin_account_id:null,destination_account_id:null,category_id:null,destination_amount:null,destination_currency:null,
      })}><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="transfer">Transferencia</option></select></label>
      {payload.tx_type==='transfer'?<>
       {field('Origen','origin_account_id',activeAccounts)}{field('Destino','destination_account_id',activeAccounts)}
       <label className="text-sm">Importe recibido si cambia moneda<Input className="mt-1" type="number" inputMode="decimal" step="0.01" value={payload.destination_amount??''} onChange={event=>change({destination_amount:Number(event.target.value)})}/></label>
       <label className="text-sm">Moneda recibida<select className={selectClass} value={payload.destination_currency??''} onChange={event=>change({destination_currency:event.target.value||null})}><option value="">Seleccionar</option><option value="PEN">PEN</option><option value="USD">USD</option></select></label>
      </>:field('Cuenta de pago','payment_account_id',paymentAccounts)}
      {field('Categoría','category_id',categories.filter(c=>c.is_active&&c.tx_type===payload.tx_type))}
      {field('Persona','person_id',people)}
     </div>
     <label className="block text-sm">Descripción<Textarea className="mt-1" value={payload.description??''} maxLength={500} onChange={event=>change({description:event.target.value})}/></label>
     <div className="grid gap-2 sm:flex sm:justify-end">
      <Button type="button" variant="outline" disabled={busy} onClick={()=>setEditing(null)}>Volver</Button>
      <Button disabled={busy} type="submit">{editing.mode==='edit'?'Guardar cambios':'Confirmar y registrar'}</Button>
     </div>
    </form>}
   </DialogContent>
  </Dialog>
 </div>;
}
