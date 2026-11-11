import {validateConnection} from '@/lib/connection';
import {describe,it,expect} from 'vitest';
import {limaDate,isDate} from '@/lib/dates';
import {computeBalanceUpTo} from '@/lib/balanceCalc';
import {planCapture,validatedSegments} from '@/lib/captureBatch';
import {parseCapture} from '@/lib/voiceParser';
import {collectPages} from '@/lib/pagination';
import {parseExcelRows} from '@/lib/excelImport';
import {validateMovement} from '@/lib/transactionRules';
const a:any={id:'bcp',name:'BCP-YAPE',account_type:'debit',currency:'PEN',initial_balance:100,is_active:true,counts_as_real_money:true};
const usd:any={...a,id:'usd',name:'Dólares',currency:'USD',initial_balance:10};
const food:any={id:'food',name:'Alimentación',tx_type:'expense',is_active:true};
const expense:any={id:'tx',tx_date:'2026-11-04',tx_type:'expense',payment_account_id:'bcp',amount_pen:25,amount_usd:0,currency:'PEN',category_id:'food'};
describe('Dates and financial balances',()=>{
 it('uses Lima calendar after 19h and around month/year changes',()=>{expect(limaDate(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31');expect(limaDate(new Date('2026-11-05T02:00:00Z'))).toBe('2026-11-04');});
 it('rejects impossible dates',()=>{expect(isDate('2026-02-30')).toBe(false);expect(isDate('2024-02-29')).toBe(true);});
 it('excludes future movements and future closings from today',()=>{expect(computeBalanceUpTo(a,[expense,{...expense,tx_date:'2027-01-01'}],[{account_id:'bcp',year:2027,month:2,real_balance_pen:900,real_balance_usd:0}],'2026-11-04',true).pen).toBe(75);});
 it('reconciles against previous closing while using completed closing for available balance',()=>{const c=[{account_id:'bcp',year:2026,month:10,real_balance_pen:500,real_balance_usd:0}];expect(computeBalanceUpTo(a,[expense],c,'2026-11-04',true).pen).toBe(475);expect(computeBalanceUpTo(a,[],c,'2026-10-31').pen).toBe(100);expect(computeBalanceUpTo(a,[],c,'2026-10-31',true).pen).toBe(500);});
 it('places USD initial balance in USD and accounts for received exchange amount',()=>{expect(computeBalanceUpTo(usd,[],[],'2026-11-04')).toEqual({pen:0,usd:10});const t:any={...expense,tx_type:'transfer',origin_account_id:'bcp',destination_account_id:'usd',amount_pen:37.5,destination_amount:10,destination_currency:'USD'};expect(computeBalanceUpTo(a,[t],[],'2026-11-04').pen).toBe(62.5);expect(computeBalanceUpTo(usd,[t],[],'2026-11-04').usd).toBe(20);});
 it('does not change money for a debt without an account',()=>{expect(computeBalanceUpTo(a,[{...expense,payment_account_id:null}],[],'2026-11-04').pen).toBe(100);});
 it('uses cents for decimal summation',()=>{const tx=[{...expense,amount_pen:.1},{...expense,amount_pen:.2}];expect(computeBalanceUpTo({...a,initial_balance:0},tx,[],'2026-11-04').pen).toBe(-.3);});
});
describe('Voice classification with safe defaults',()=>{
 it('maps Yape only to BCP-YAPE and can post a complete simple expense',()=>{const p=parseCapture('Gasté 25 soles en almuerzo con Yape',[a],[food],[],'2026-11-04');expect(p.payload.payment_account_id).toBe('bcp');expect(p.autoPost).toBe(true);});
 it('drafts absent/ambiguous accounts, currency and multiple movements',()=>{for(const s of ['Gasté 25 soles en almuerzo','Gasté 25 en almuerzo con Yape','Gasté 25 soles en almuerzo y 10 en taxi con Yape'])expect(parseCapture(s,[a],[food],[]).autoPost).toBe(false);});
 it('never auto-posts negation or pending payments',()=>{for(const s of ['No gasté 25 soles en almuerzo con Yape','Pagué 25 soles en almuerzo con Yape pendiente'])expect(parseCapture(s,[a],[food],[]).autoPost).toBe(false);});
 it('interprets yesterday in Lima',()=>{expect(parseCapture('Ayer gasté 25 soles en almuerzo con Yape',[a],[food],[],'2026-11-01').payload.tx_date).toBe('2026-10-31');});
 it('does not auto-post transfers or debt forgiveness',()=>{expect(parseCapture('Transferí 25 soles de BCP a efectivo',[a],[food],[]).autoPost).toBe(false);expect(parseCapture('Le condoné 25 soles a Juan',[a],[food],[]).autoPost).toBe(false);});
});
describe('Import, pagination and validation',()=>{
 it('throws on failure of page 2 instead of returning truncated balances',async()=>{await expect(collectPages(async(f)=>f===0?{data:[1,2],error:null}:{data:null,error:new Error('network')},2)).rejects.toThrow('network');});
 it('collects over 1000 rows without truncation',async()=>{const all=Array.from({length:1062},(_,i)=>i);expect((await collectPages(async(f,to)=>({data:all.slice(f,to+1),error:null}))).length).toBe(1062);});
 it('preserves the provided TC row, ND, pending description and PEN amount',()=>{const r=parseExcelRows([{Fecha:'2026-11-04',Tipo:'TI',Origen:'Débito Interbank',Destino:'VISA Interbank Platinum','Referente a':'ND','Categoría':'Pago TC','Descripción':'Pago TC Octubre - 4.17$ / Pendiente: 1',Soles:14.46,'Dólares':0}],()=>({y:0,m:0,d:0}))[0];expect(r.amount_pen).toBe(14.46);expect(r.amount_usd).toBe(0);expect(r.person).toBe('');expect(r.description).toContain('Pendiente: 1');expect(r.tx_type).toBe('transfer');});
 it('rejects an invalid Excel row rather than silently skipping it',()=>{expect(()=>parseExcelRows([{Fecha:'2026-11-04',Tipo:'Gasto',Soles:-1}],()=>({y:0,m:0,d:0}))).toThrow();});
 it('requires separate transfer accounts and positive values',()=>{expect(validateMovement({...expense,amount_pen:0},[a],[food]).length).toBeGreaterThan(0);expect(validateMovement({...expense,tx_type:'transfer',origin_account_id:'bcp',destination_account_id:'bcp'},[a],[food]).length).toBeGreaterThan(0);});
});

describe('Connection configuration',()=>{
 it('rejects privileged or malformed credentials',()=>{expect(()=>validateConnection('https://test.supabase.co','sb_secret_example')).toThrow();});
 it('rejects non-Supabase or unencrypted endpoints',()=>{expect(()=>validateConnection('http://test.supabase.co','sb_publishable_example')).toThrow();expect(()=>validateConnection('https://example.com','sb_publishable_example')).toThrow();});
 it('accepts a public project key',()=>{expect(validateConnection('https://test.supabase.co','sb_publishable_example').url).toBe('https://test.supabase.co');});
});

describe('frases naturales de Zentry 2.1',()=>{
 const panas={...food,id:'panas',name:'Panas'};
 const fast={...food,id:'fast',name:'Comida rápida'};
 const visa={...a,id:'visa',name:'Visa BCP',account_type:'credit' as const};
 const amex={...a,id:'amex',name:'Amex BCP',account_type:'credit' as const};
 const sentence='Hola, hoy acabo de gastar 25 soles en KFC (Comida rápida) con mis amigos (Categoría Panas) y pagué con tarjeta de crédito BCP';
 it('prioriza la categoría explícita y conserva la categoría de comida independiente',()=>{
  const parsed=parseCapture(sentence,[a,visa],[panas,fast],[],'2026-11-07');
  expect(parsed.payload).toMatchObject({tx_type:'expense',amount_pen:25,payment_account_id:'visa',category_id:'panas',tx_date:'2026-11-07'});
  expect(parsed.autoPost).toBe(true);
  expect(parseCapture('Gasté veinticinco soles en K F C con tarjeta de crédito B.C.P.',[visa],[panas,fast],[]).payload).toMatchObject({category_id:'fast',amount_pen:25,payment_account_id:'visa'});
 });
 it('pide elegir entre dos tarjetas de crédito y conserva categoría e importe',()=>{
  const parsed=parseCapture(sentence,[a,visa,amex],[panas,fast],[]);
  expect(parsed.accountChoices).toEqual(['visa','amex']);
  expect(parsed.payload).toMatchObject({payment_account_id:null,category_id:'panas',amount_pen:25});
  expect(parsed.autoPost).toBe(false);
 });
 it('resuelve alias confirmados y trata pagar la tarjeta como transferencia',()=>{
  const parsed=parseCapture('Gasté 25 soles con los patas y pagué con mi Visa',[visa,amex],[panas,fast],[],undefined,[
   {field:'category',id:'panas',phrase:'con los patas'},{field:'account',id:'visa',phrase:'mi visa'},
  ]);
  expect(parsed.payload).toMatchObject({payment_account_id:'visa',category_id:'panas'});
  expect(parseCapture('Pagué mi tarjeta Visa BCP, 25 soles',[visa],[panas,fast],[]).payload.tx_type).toBe('transfer');
 });
});

describe('dictados con descripción y varios movimientos',()=>{
 const transit={...food,id:'transit',name:'Transporte'};
 const cinema={...food,id:'cinema',name:'Entretenimiento'};
 const loan={...food,id:'loan',name:'Préstamos / Deudas',system_code:'loan_given'};
 const card={...a,id:'card',name:'VISA Latam BCP Platinum',account_type:'credit'};
 const people=[{id:'andrea',name:'Andrea'},{id:'joaquin',name:'Joaquín'}];
 const transcript='Fui al cine con mis amigos para mi entrada para que siete sols como mi trajeta de crédito BCP para Andrea le hice un presta para su entrada de siete sols y también lo paguen con esa trajeta y para Joaquín también pague con esa tarjeta';
 it('extrae el concepto del viaje y pide verificar la moneda cortada',()=>{
  const parsed=parseCapture('moto desde casa al mall por 5 so pagué con yape',[a],[transit],[]);
  expect(parsed.payload).toMatchObject({description:'moto desde casa al mall',amount_pen:5,currency:'PEN',category_id:'transit',payment_account_id:'bcp'});
  expect(parsed.issues).toContain('Confirma soles: la transcripción de la moneda quedó incompleta');
  expect(parsed.autoPost).toBe(false);
  expect(parseCapture('moto desde casa al mall por cinco soles pagué con Yape',[a],[transit],[]).payload.description).toBe('moto desde casa al mall');
 });
 it('separa el gasto propio y dos préstamos de la captura, con el tercer importe vacío',()=>{
  const result=planCapture(transcript,[card],[cinema,loan],people,[]);
  expect(result.map(item=>item.payload)).toMatchObject([
   {description:'Entrada al cine',category_id:'cinema',person_id:null,amount_pen:7,payment_account_id:'card'},
   {description:'Entrada al cine',category_id:'loan',person_id:'andrea',amount_pen:7,payment_account_id:'card'},
   {description:'Entrada al cine',category_id:'loan',person_id:'joaquin',amount_pen:0,payment_account_id:'card'},
  ]);
  expect(result.every(item=>!item.autoPost)).toBe(true);
  expect(result[2].issues).toContain('Indica el importe de este movimiento');
 });
 it('no confunde el destinatario de un solo gasto con una operación nueva',()=>{
  expect(planCapture('Compré un regalo por 5 soles para Andrea',[a],[food],people,[])).toHaveLength(1);
 });
 it('separa dos compras con verbos distintos y montos propios',()=>{
  const result=planCapture('Gasté 5 soles en taxi con Yape y compré almuerzo por 7 soles con Yape',[a],[transit,food],[],[]);
  expect(result.map(item=>item.payload.amount_pen)).toEqual([5,7]);
  expect(result.map(item=>item.payload.description)).toEqual(['taxi','almuerzo']);
 });
 it('rechaza sugerencias de IA con cifras inventadas o movimientos omitidos',()=>{
  const input='Gasté 5 soles en taxi y compré almuerzo por 7 soles';
  expect(validatedSegments(input,['Gasté 5 soles en taxi','compré almuerzo por 7 soles'])).toHaveLength(2);
  expect(()=>validatedSegments(input,['Gasté 8 soles en taxi','compré almuerzo por 7 soles'])).toThrow();
  expect(()=>validatedSegments(input,['Gasté 5 soles','compré almuerzo por 7 soles'])).toThrow();
 });
});

it('recognizes Metro aliases and fractional soles without using the regular Metro account',()=>{
 const metro={...a,id:'univ',name:'Metropolitano Univ'};
 const regular={...a,id:'normal',name:'Metropolitano'};
 const mobility={...food,id:'mobility',name:'Movilidad'};
 for(const alias of ['metropolitano universitario','metro uni','metro universitario']){
  const result=parseCapture(`Registra un gasto de un sol 20 con tarjeta ${alias} por pasaje a la UPC`,[regular,metro],[mobility],[]);
  expect(result.payload).toMatchObject({amount_pen:1.2,category_id:'mobility',payment_account_id:'univ',description:'pasaje a la UPC'});
 }
 const result=parseCapture('Gasté un sol veinte con metro uni por pasaje a la UPC',[regular],[mobility],[]);
 expect(result.payload.payment_account_id).toBeNull();
 expect(result.payload.amount_pen).toBe(1.2);
});
