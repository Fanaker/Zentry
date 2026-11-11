export async function removeLegacyModels(): Promise<void> {
 const android=window.ZentryAndroid;
 if (!android?.removeLegacyModels) return;
 if (window.zentryCleanupResult) throw new Error('La limpieza ya está en curso.');
 await new Promise<void>((resolve,reject)=>{
  const timer=window.setTimeout(()=>{
   delete window.zentryCleanupResult;
   reject(new Error('Se agotó el tiempo. Reintenta la limpieza.'));
  },30000);
  window.zentryCleanupResult=error=>{
   window.clearTimeout(timer);
   delete window.zentryCleanupResult;
   if(error)reject(new Error(error)); else resolve();
  };
  android.removeLegacyModels();
 });
 // Earlier Zentry builds used this origin-private directory only for Qwen.
 if (navigator.storage?.getDirectory) {
  const root=await navigator.storage.getDirectory();
  try { await root.removeEntry('cache',{recursive:true}); }
  catch(error) { if (!(error instanceof DOMException) || error.name!=='NotFoundError') throw error; }
 } else throw new Error('Los modelos de voz se limpiaron. Este WebView no permite verificar la caché anterior de IA.');
}
