declare global {
 interface Window {
  ZentryAndroid?: {
   showKeyboard?():void;
   removeLegacyModels?():void;
   canUseDeviceLock?():boolean;
   isDeviceLockEnabled?():boolean;
   configureDeviceLock?(enabled:boolean):void;
   saveFile(name:string,mime:string,base64:string):void;
  };
  zentryCleanupResult?:(error:string)=>void;
 }
}

export const hasNativeVoice=()=>!!window.ZentryAndroid;

export function saveBytes(name:string,mime:string,data:Uint8Array){
 if(window.ZentryAndroid){let str='';for(let i=0;i<data.length;i+=8192)str+=String.fromCharCode(...data.subarray(i,i+8192));window.ZentryAndroid.saveFile(name,mime,btoa(str));return;}
 const url=URL.createObjectURL(new Blob([data as BlobPart],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function saveJSON(name:string,data:unknown){saveBytes(name,'application/json',new TextEncoder().encode(JSON.stringify(data,null,2)));}
