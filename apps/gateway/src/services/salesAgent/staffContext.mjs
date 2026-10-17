import {salesError} from './policy.mjs';
const languages=new Set(['auto','tr','en','fr','ar','de','it','es','bg','ru','ro','sq']);
export function staffSalesContext(input={}){
 const language=input.customerLanguage??'auto',currentComposer=input.currentComposer??'',draftContext=input.draftContext??null;
 if(!languages.has(language)||typeof currentComposer!=='string'||currentComposer.length>2000||/[\u0000]/.test(currentComposer))throw salesError('AI_STAFF_CONTEXT_INVALID');
 let draft=null;
 if(draftContext!==null){if(!draftContext||Array.isArray(draftContext)||typeof draftContext!=='object'||Object.keys(draftContext).some(key=>!['requestId','customerId','items'].includes(key))||!Array.isArray(draftContext.items)||draftContext.items.length>50)throw salesError('AI_STAFF_CONTEXT_INVALID');
  if(draftContext.requestId!==undefined&&!/^[0-9a-f-]{36}$/i.test(draftContext.requestId)||draftContext.customerId!==undefined&&(!Number.isSafeInteger(draftContext.customerId)||draftContext.customerId<1))throw salesError('AI_STAFF_CONTEXT_INVALID');
  const items=draftContext.items.map(item=>{if(!item||Object.keys(item).some(key=>!['erpProductId','stockCode','quantity'].includes(key))||!Number.isSafeInteger(item.erpProductId)||item.erpProductId<1||typeof item.stockCode!=='string'||!item.stockCode||item.stockCode.length>120||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>9999)throw salesError('AI_STAFF_CONTEXT_INVALID');return {erpProductId:item.erpProductId,stockCode:item.stockCode,quantity:item.quantity};});
  draft={...(draftContext.requestId?{requestId:draftContext.requestId}:{}),...(draftContext.customerId?{customerId:draftContext.customerId}:{}),items};
 }
 return {customerLanguage:language,currentComposer,draftContext:draft,trust:'staff-editable-context-only'};
}
