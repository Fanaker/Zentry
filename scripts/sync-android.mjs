import {mkdir,cp,rm} from 'node:fs/promises';
const target=new URL('../android/app/src/main/assets/web/',import.meta.url);
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});await cp(new URL('../dist/',import.meta.url),target,{recursive:true});
console.log('Web assets copied to Android.');
