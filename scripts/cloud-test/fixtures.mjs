// Fictional cloud fixtures only. These identifiers never refer to a live database.
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {pngChunk} from '../../apps/gateway/src/utils/validMediaFixtures.js';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export const database='MELISA_ERP_CRM_SHARED_TEST_20261009_02';
export const currentSource=Object.freeze({runId:'PRODUCT-00000000-0000-4000-8000-000000000016',sourceAsOf:'2026-10-16',sourceHash:hash('synthetic-products'),planHash:hash('synthetic-plan'),bindingsHash:hash('synthetic-bindings'),snapshotHash:hash('synthetic-snapshot'),actualT1:false,counts:{products:2,prices:2}});
export const actors={
 manager:{id:'manager',username:'manager',displayName:'Sentetik Müdür',role:'patron',active:true,permissions:['crm.view','crm.send','crm.assign','crm.manage'],chatwootAgentId:1,customerProductRequestIssuer:true,liveSendEnabled:false,paidAiEnabled:false},
 assigned:{id:'assigned',username:'assigned',displayName:'Sentetik Personel',role:'personel',active:true,permissions:['crm.view'],chatwootAgentId:2,liveSendEnabled:false,paidAiEnabled:false},
 stranger:{id:'stranger',username:'stranger',displayName:'Sentetik Diğer Personel',role:'personel',active:true,permissions:['crm.view'],chatwootAgentId:3,liveSendEnabled:false,paidAiEnabled:false},
};
export const conversations=[['55','Sentetik Müşteri A','+905550000001'],['56','Sentetik Müşteri B','+905550000002']].map(([id,name,phone])=>({id,name,phone,contactId:id==='55'?'101':'102',accountId:'1',inboxId:'2',backend:'chatwoot',provider:'chatwoot',assignedUserId:2,assignedUserName:'Sentetik Personel',chatwootAgentId:2,channel:'whatsapp',language:'Türkçe',unread:0,preview:'Örnek ürünleri sipariş taslağına eklemek istiyorum.',messages:[{id:Number(id)*100,direction:'incoming',text:'Sentetik test: ürünleri ve adetleri seçebilir miyiz?',createdAt:'2026-10-16T09:00:00.000Z'}],lastMessageAt:'2026-10-16T09:00:00.000Z',detailLoaded:true,messagesLoaded:true}));
export const customers=conversations.map((conversation,index)=>({id:701+index,code:'SYN-C00'+(index+1),name:conversation.name,currency:'TRY',blocked:false,revision:hash('synthetic-customer-'+conversation.id),exactPhoneMatch:true,phone:conversation.phone.replace(/\D/g,'')}));
export const products=[['8023','Sentetik bebek takımı','Takım','196.00000000'],['9044','Sentetik battaniye','Battaniye','85.50000000']].map(([id,productName,category,priceExact],index)=>({id:'erp-'+id,erpProductId:Number(id),stockCode:'SYN-'+id,safeCode:'SYN-'+id,productName,category,brand:'Sentetik Koleksiyon',barcode:null,barcodes:[],status:'active',isActive:true,active:true,hold:{blocked:false},unit:{verified:true,label:'adet'},salePrices:[{id:String(900+index),unitSourceId:'1',tier:1,currency:'TRY',isMainUnit:true,sourceKey:'synthetic-price-'+id,priceExact,pricing:{origin:'SOURCE',versionId:null,sourcePriceExact:priceExact}}],salePrice:Number(priceExact),priceExact,currency:'TRY',priceSourceKey:'synthetic-price-'+id,stockQuantity:null,revision:hash('synthetic-product-'+id),photoStatus:'guarded-path',photoPath:'/crm/catalog/products/erp-'+id+'/photo',thumbnailPath:'/crm/catalog/products/erp-'+id+'/photo?variant=thumbnail',photo:{validationStatus:'CONFIRMED'},synthetic:true}));

export function catalogMeta(query={},total=products.length){
 const page=Number(query.page||1),limit=Number(query.limit||50),hasImage=query.hasImage!=='false';
 return {source:'melisa-erp-catalog',catalogVersion:'melisa-catalog.v1',environment:'CANONICAL_TEST',cached:false,sourceDatabaseVerified:true,stockFreshness:'native-test',freshLive:false,fetchedAt:new Date().toISOString(),sourceAsOf:'2026-10-16',page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit)),hasNextPage:page<Math.ceil(total/limit),hasPreviousPage:page>1,filters:{search:query.search||'',barcode:query.barcode||'',brand:query.brand||null,category:query.category||null,hasImage},facets:{brands:[{value:'Sentetik Koleksiyon',count:null}],categories:[{value:'Takım',count:null},{value:'Battaniye',count:null}]},businessScope:{scopeKind:'VERIFIED_BUSINESS_TEST',database,supportedCurrencies:['TRY','USD','EUR']},synthetic:true,sourceBoundary:'fictional-cloud-fixture-no-database'};
}

// Deterministic, local PNG drawings, visibly fixture artwork, with no downloaded images.
export function productPhoto(id){
 const size=240,body=Buffer.alloc(size*(size*3+1)),pink=id==='erp-8023';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const p=y*(size*3+1)+1+x*3;
  const shape=pink?(y>55&&y<183&&x>70&&x<170||y>55&&y<100&&x>42&&x<198):(x>45&&x<195&&y>45&&y<195);
  const stripe=shape&&(pink?Math.abs(x-120)<5&&y<110:((x+y)%34<4));
  const color=stripe?[255,255,255]:shape?(pink?[207,141,153]:[125,164,175]):[246,243,238];
  color.forEach((v,i)=>{body[p+i]=v;});
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(body)),pngChunk('IEND',Buffer.alloc(0))]);
}
