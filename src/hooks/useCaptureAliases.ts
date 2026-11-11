import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {collectPages} from '@/lib/pagination';
import {normalize,type VoiceAlias} from '@/lib/voiceParser';

type AliasRow = {field:VoiceAlias['field']; phrase_key:string; phrase:string; target_id:string};
const identity = (alias:VoiceAlias)=>alias.field+':'+normalize(alias.phrase);
const keyFor = (userId:string)=>'zentry.voice.'+userId+'.aliases';

function readLocal(key:string): VoiceAlias[] {
 try {
  const saved=JSON.parse(localStorage.getItem(key)??'[]');
  return Array.isArray(saved)?saved.filter(a=>typeof a?.phrase==='string'&&typeof a?.id==='string'&&['account','category'].includes(a?.field)):[];
 } catch { return []; }
}

export function useCaptureAliases(userId:string) {
 const key=keyFor(userId);
 const [local,setLocal]=useState(()=>readLocal(key));
 const queryClient=useQueryClient();
 const queryKey=['capture_aliases',userId];
 const cloud=useQuery({
  queryKey,enabled:!!userId,retry:false,
  queryFn:async()=>{
   try {
    return await collectPages<AliasRow>((from,to)=>(supabase as any).from('capture_aliases')
      .select('field,phrase_key,phrase,target_id').order('field').order('phrase_key').range(from,to));
   } catch(error) {
    if (['PGRST205','42P01'].includes(error?.code)) return null;
    throw error;
   }
  },
  refetchInterval:30000,
 });
 const synced=Array.isArray(cloud.data);
 const remote:VoiceAlias[]=(cloud.data??[]).map(row=>({field:row.field,phrase:row.phrase,id:row.target_id}));
 const aliases=[...new Map([...local,...remote].map(alias=>[identity(alias),alias])).values()];
 function updateLocal(next:VoiceAlias[]) {
  localStorage.setItem(key,JSON.stringify(next));
  setLocal(next);
 }
 async function save(alias:VoiceAlias) {
  if (synced) {
   const {error}=await (supabase as any).from('capture_aliases').upsert({
    owner_id:userId,field:alias.field,phrase_key:normalize(alias.phrase),phrase:alias.phrase,target_id:alias.id,
   },{onConflict:'owner_id,field,phrase_key'});
   if(error) throw error;
   await queryClient.invalidateQueries({queryKey});
   updateLocal(local.filter(item=>identity(item)!==identity(alias)));
  } else updateLocal([...local.filter(item=>identity(item)!==identity(alias)),alias]);
 }
 async function remove(alias:VoiceAlias) {
  if(synced) {
   const {error}=await (supabase as any).from('capture_aliases').delete().eq('owner_id',userId)
    .eq('field',alias.field).eq('phrase_key',normalize(alias.phrase));
   if(error) throw error;
   await queryClient.invalidateQueries({queryKey});
  }
  updateLocal(local.filter(item=>identity(item)!==identity(alias)));
 }
 async function syncLocal(){
  if(!synced||!local.length)return;
  const rows=local.map(alias=>({
   owner_id:userId,field:alias.field,phrase_key:normalize(alias.phrase),phrase:alias.phrase,target_id:alias.id,
  }));
  const {error}=await (supabase as any).from('capture_aliases')
   .upsert(rows,{onConflict:'owner_id,field,phrase_key',ignoreDuplicates:true});
  if(error)throw error;
  await queryClient.invalidateQueries({queryKey});
  updateLocal([]);
 }
 return {aliases,synced,localCount:local.length,loading:cloud.isPending&&!!userId,syncLocal,save,remove};
}
