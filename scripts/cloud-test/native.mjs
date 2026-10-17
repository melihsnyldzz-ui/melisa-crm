// The unavailable native ERP boundary. Production HTTP adapter/CRM code is reused.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {validateNativeOrder,validateNativeReceipt} from '../../apps/frontend/src/lib/nativeOrder.js';
import {currentSource,customers,products,conversations} from './fixtures.mjs';

const fail=(code,statusCode=400)=>{throw Object.assign(Error(code),{code,statusCode});};
const exact4=value=>(value/10000n).toString()+'.'+(value%10000n).toString().padStart(4,'0');
const source8=value=>BigInt(value.replace('.',''));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createSyntheticNative({storeFile}){
 let queue=Promise.resolve();
 const stats={createAttempts:0,created:0,detailReads:0};
 async function read(){
  let data;try{data=JSON.parse(await readFile(storeFile,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1,synthetic:true,drafts:[]};throw error;}
  if(data.version!==1||data.synthetic!==true||!Array.isArray(data.drafts))fail('SYNTHETIC_JOURNAL_INVALID',503);
  for(const entry of data.drafts){if(!/^\d+$/.test(entry.nativeActorId))fail('SYNTHETIC_JOURNAL_INVALID',503);validateNativeReceipt(entry.receipt,entry.receipt.request,currentSource);}
  return data;
 }
 async function persist(data){await mkdir(path.dirname(storeFile),{recursive:true});const temp=storeFile+'.tmp';await writeFile(temp,JSON.stringify(data,null,2),{mode:0o600});await rename(temp,storeFile);}
 async function create(body,nativeActorId){
  stats.createAttempts++;try{validateNativeOrder(body);}catch{fail('ERP_DRAFT_INVALID');}
  const customer=customers.find(c=>c.id===body.customerId);
  if(!customer||customer.phone!==body.peer||customer.revision!==body.customerMatch.revision||customer.currency!==body.documentCurrency||!conversations.some(c=>c.id===body.conversationId&&c.phone.replace(/\D/g,'')===body.peer))fail('ERP_CUSTOMER_MAPPING_REQUIRED',409);
  for(const line of body.items){const product=products.find(p=>p.erpProductId===line.productId),price=product?.salePrices[0];if(!product||product.stockCode!==line.stockCode||price.id!==String(line.priceId)||price.unitSourceId!==String(line.unitSourceId)||price.currency!==line.currency||price.priceExact!==line.priceExact8||price.sourceKey!==line.priceSourceKey||line.pricingWitness)fail('ERP_PRODUCT_MAPPING_REQUIRED',409);}
  const data=await read(),previous=data.drafts.find(d=>d.receipt.request.requestId===body.requestId);
  if(previous){if(previous.nativeActorId!==nativeActorId)fail('ERP_DRAFT_FORBIDDEN',403);if(!same(previous.receipt.request,body))fail('ERP_DRAFT_IDEMPOTENCY_CONFLICT',409);return previous.receipt;}
  let total=0n;const items=body.items.map(line=>{const price=(source8(line.priceExact8)+5000n)/10000n,lineTotal=price*BigInt(line.quantity);total+=lineTotal;return {...line,unitPriceExact4:exact4(price),lineTotalExact4:exact4(lineTotal)};});
  const receipt={request:structuredClone(body),documentNo:'SYN-DRAFT-'+String(data.drafts.length+1).padStart(4,'0'),customerName:customer.name,status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items,grandTotalExact4:exact4(total),amountTryExact4:exact4((total*source8(body.exchangeRateExact8)+50000000n)/100000000n),sourceMetadataStatus:'sealed-current-source',currentSource,synthetic:true,persistenceBoundary:'local-file-journal-no-erp-database'};
  validateNativeReceipt(receipt,body,currentSource);data.drafts.push({nativeActorId,receipt});await persist(data);stats.created++;return receipt;
 }
 return {stats,read,customers:async(phone,search='')=>({phone,status:'matched',entries:customers.filter(c=>c.phone===phone&&(!search||(c.code+' '+c.name).toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))),currentSource}),
  create(body,nativeActorId){const next=queue.then(()=>create(body,nativeActorId));queue=next.catch(()=>{});return next;},
  async detail(requestId,nativeActorId){stats.detailReads++;const row=(await read()).drafts.find(d=>d.receipt.request.requestId===requestId);if(!row)fail('ERP_DRAFT_NOT_FOUND',404);if(row.nativeActorId!==nativeActorId)fail('ERP_DRAFT_FORBIDDEN',403);return row.receipt;},
 };
}
