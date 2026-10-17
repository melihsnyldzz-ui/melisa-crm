import {createNativeOrderStore} from './nativeOrder.js';
import {priceLabelText} from '../catalog/productActions.js';

// This is an index of the current actor's recovery journals, not an ERP archive.
// Only conversations present in the authorized inbox can contribute a card.
export function restoreNativeOrderHistory({actor,conversations,storage}) {
 const orders=[],unreadable=[];
 if(!actor)return {orders,unreadable};
 for(const conversation of conversations) {
  try {
   const record=createNativeOrderStore(actor,conversation.id,storage).read();
   if(!record)continue;
   const {payload}=record;
   const total=payload.items.reduce((sum,line)=>sum+((BigInt(line.priceExact8.replace('.',''))+5000n)/10000n)*BigInt(line.quantity),0n);
   const exact4=`${total/10000n}.${String(total%10000n).padStart(4,'0')}`;
   orders.push({id:payload.requestId,requestId:payload.requestId,conversationId:payload.conversationId,
    customer:conversation.name,customerId:payload.customerId,owner:conversation.owner,
    total:`${payload.documentCurrency} ${priceLabelText(exact4+'0000')}`,lines:payload.items.length,
    status:record.resolved?'ERP kaydı yeniden okunmalı':'Sonuç doğrulanmalı',updated:'Bu tarayıcı oturumunda korunuyor',readbackRequired:true});
  } catch {unreadable.push(String(conversation.id));}
 }
 return {orders,unreadable};
}

export function nativeOrderReceiptCard(receipt,{customer,owner}) {
 return {...receipt,id:receipt.request.requestId,requestId:receipt.request.requestId,
  conversationId:receipt.request.conversationId,customer:receipt.customerName||customer,owner,
  total:`${receipt.request.documentCurrency} ${priceLabelText(receipt.grandTotalExact4+'0000')}`,
  lines:receipt.items.length,status:'ERP taslağı doğrulandı',updated:'ERP’den yeniden okundu',readbackRequired:false};
}
