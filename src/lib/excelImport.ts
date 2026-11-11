import {isDate} from './dates';
export function parseExcelRows(rows:any[],dateParser:(value:number)=>{y:number;m:number;d:number}){
 return rows.map((r,index)=>{
  let date=String(r.Fecha??'').trim();
  if(typeof r.Fecha==='number'){const d=dateParser(r.Fecha);date=`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}
  else if(/^\d{2}\/\d{2}\/\d{4}$/.test(date)){const [d,m,y]=date.split('/');date=`${y}-${m}-${d}`;}
  const type=({'gasto':'expense','ingreso':'income','ti':'transfer'} as const)[String(r.Tipo??'').trim().toLowerCase()];
  const amount=(x:unknown)=>{if(x===''||x==null)return 0;if(typeof x==='string'&&!/^\d+(?:[.,]\d{1,2})?$/.test(x.trim()))throw new Error(`Fila ${index+2}: importe ambiguo. Usa celdas numéricas.`);const n=Number(String(x).replace(',','.'));if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.001)throw new Error(`Fila ${index+2}: importe inválido`);return n;};
  const pen=amount(r.Soles),usd=amount(r['Dólares']??r.Dolares);
  if(!isDate(date)||!type||pen+usd<=0)throw new Error(`Fila ${index+2}: revisa fecha, tipo e importe`);
  const str=(key:string)=>String(r[key]??'').trim();
  return {tx_date:date,tx_type:type,currency:usd>0&&pen===0?'USD':'PEN',amount_pen:pen,amount_usd:usd,payment_account:type==='transfer'?'':str('Medio de Pago'),origin_account:type==='transfer'?str('Origen'):'',destination_account:type==='transfer'?str('Destino'):'',category:str('Categoría')||str('Categoria'),person:str('Referente a').toUpperCase()==='ND'?'':str('Referente a'),description:str('Descripción')||str('Descripcion')};
 });
}
export async function sha256(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
