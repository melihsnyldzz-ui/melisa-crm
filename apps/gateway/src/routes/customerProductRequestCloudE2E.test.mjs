import '../../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCustomerProductRequestService} from '../services/customerProductRequest.mjs';
import {createCustomerProductRequestRouter} from './customerProductRequestRoutes.mjs';
import {createCustomerRequestApi,createStaffRequestApi} from '../../../frontend/src/customerProductRequest/api.js';
import {createRequestController} from '../../../frontend/src/customerProductRequest/controller.js';

const ORIGIN='http://127.0.0.1:64200',UUID='00000000-0000-4000-8000-000000000001';
const hash=value=>createHash('sha256').update(value).digest('hex');
const manager={id:'manager',role:'patron',normalSessionId:randomUUID(),fingerprint:hash('manager'),expiresAt:Date.now()+3600000,active:true,permissions:['crm.view','crm.manage']};
const assigned={id:'assigned',role:'personel',active:true,permissions:['crm.view']};
const stranger={id:'stranger',role:'personel',active:true,permissions:['crm.view']};
const binding={backend:'chatwoot',provider:'chatwoot',accountId:'1',inboxId:'2',chatwootConversationId:'55',chatwootContactId:'101',assigneeId:'2',customerFingerprint:hash('fictional-customer')};
const products=[['vega-8023','8023','Sentetik bebek takımı','TAKIM'],['vega-9044','9044','Sentetik battaniye','BATTANIYE']].map(([id,stockCode,productName,category])=>({id,stockCode,productName,category,age:null,active:true,photoStatus:'guarded-path',photoPath:'/crm/catalog/products/'+id+'/photo'}));
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
async function fixture(t){
 const folder=await mkdtemp(path.join(os.tmpdir(),'melisa-crm06-e2e-')),storeFile=path.join(folder,'requests.json');
 let catalogReads=0,productReads=0;
 const service=createCustomerProductRequestService({
  config:{enabled:true,isolatedPreparation:true,database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',catalogScope:'synthetic-cloud-e2e'},storeFile,
  resolveBinding:async(actor,conversation)=>{
   if(conversation!=='55'||!['manager','assigned'].includes(actor.id))throw Object.assign(Error('Denied'),{code:'CUSTOMER_REQUEST_FORBIDDEN',statusCode:403});
   return binding;
  },
  validateBinding:async()=>true,
  readProduct:async id=>{productReads++;return {success:true,data:products.find(p=>p.id===id)||null,meta:{sourceDatabaseVerified:true,cached:false}};},
  readCatalogPage:async query=>{
   catalogReads++;
   const rows=products.filter(p=>(!query.search||(p.productName+' '+p.stockCode).toLowerCase().includes(query.search.toLowerCase()))&&(!query.category||p.category===query.category));
   const pages=Math.max(1,Math.ceil(rows.length/query.limit));
   return {success:true,data:rows.slice((query.page-1)*query.limit,query.page*query.limit),meta:{sourceDatabaseVerified:true,cached:false,page:query.page,limit:query.limit,total:rows.length,totalPages:pages,hasNextPage:query.page<pages,facets:{categories:[{value:'TAKIM',count:1},{value:'BATTANIYE',count:1}],ages:[]}}};
  },
  readPhoto:async()=>({bytes:Uint8Array.from([255,216,255,...Array(20).fill(0)]),mime:'image/jpeg'}),
 });
 const app=express();app.use(express.json({limit:'16kb'}));
 app.use('/api/live',createCustomerProductRequestRouter({Router:express.Router,service,allowedOrigins:[ORIGIN],verifyStaff:async req=>{
  const actors={'Bearer manager-synthetic':manager,'Bearer assigned-synthetic':assigned,'Bearer stranger-synthetic':stranger};
  const actor=actors[req.get('authorization')];
  if(!actor)throw Object.assign(Error('Unauthorized'),{code:'AUTH_TOKEN_INVALID',statusCode:401});
  return actor;
 }}));
 app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({success:false,error:{code:error.code||'SYNTHETIC_FAILURE'}}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base='http://127.0.0.1:'+server.address().port;
 const fetcher=(route,options)=>fetch(base+route,{...options,headers:{...options.headers,Origin:ORIGIN}});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true});});
 return {customer:token=>createCustomerRequestApi(token,{fetcher}),staff:token=>createStaffRequestApi(token,{fetcher}),storeFile,statistics:()=>({catalogReads,productReads})};
}

test('CRM06 actual HTTP: manager → catalogue → selection/quantity → one saved request → refresh → assigned staff',async t=>{
 const f=await fixture(t),grant=await f.staff('manager-synthetic').issue('55');
 assert.match(grant.capability,/^[A-Za-z0-9_-]{43}$/);
 const api=f.customer(grant.capability),storage=memory();
 const customer=createRequestController({api,storage,uuid:()=>UUID});t.after(()=>customer.dispose());
 await customer.open();
 assert.deepEqual(customer.getState().products.map(p=>p.stockCode),['8023','9044']);
 await customer.search({search:'8023',page:1});
 assert.deepEqual(customer.getState().products.map(p=>p.id),['vega-8023']);
 await customer.toggle(customer.getState().products[0]);
 await customer.search({search:'',page:1});
 await customer.toggle(customer.getState().products.find(p=>p.id==='vega-9044'));
 await customer.edit([{productId:'vega-8023',quantity:3},{productId:'vega-9044',quantity:2}]);
 assert.equal(customer.getState().session.draft.revision,3);
 customer.review();assert.equal(customer.getState().step,'review');
 const sent=await customer.submit();
 assert.equal(sent.request.modelCount,2);assert.equal(sent.request.quantityTotal,5);
 assert.deepEqual(sent.request.items.map(i=>[i.productId,i.quantity]),[['vega-8023',3],['vega-9044',2]]);
 assert.equal(customer.getState().step,'success');
 const repeated=await api.submit(sent.draft.revision,UUID);
 assert.equal(repeated.request.id,sent.request.id,'same operation cannot create another request');
 const refreshed=createRequestController({api,storage,uuid:()=>UUID});t.after(()=>refreshed.dispose());
 await refreshed.open();assert.equal(refreshed.getState().step,'success');
 assert.equal(refreshed.getState().session.request.id,sent.request.id);
 const requests=await f.staff('assigned-synthetic').list('55');
 assert.equal(requests.length,1);assert.equal(requests[0].quantityTotal,5);
 assert.equal(requests[0].id,sent.request.id);
 assert.equal((await f.staff('assigned-synthetic').detail(sent.request.id)).modelCount,2);
 await assert.rejects(f.staff('stranger-synthetic').list('55'),error=>error.status===403);
 await assert.rejects(f.staff('stranger-synthetic').detail(sent.request.id),error=>error.status===403);
 await assert.rejects(f.staff('stranger-synthetic').issue('55'),error=>error.status===403);
 const journal=JSON.parse(await readFile(f.storeFile,'utf8'));
 assert.equal(journal.requests.length,1);
 assert.equal(journal.requests[0].status,'interest','no sale/payment/stock reservation');
 assert(f.statistics().catalogReads>=3);assert(f.statistics().productReads>=2);
});

test('CRM06 actual HTTP: stale browser cannot overwrite the saved draft or create duplicate',async t=>{
 const f=await fixture(t),grant=await f.staff('manager-synthetic').issue('55'),api=f.customer(grant.capability);
 const first=createRequestController({api,storage:memory(),uuid:()=>UUID});
 const stale=createRequestController({api,storage:memory(),uuid:()=>UUID});
 t.after(()=>{first.dispose();stale.dispose();});
 await first.open();await stale.open();
 await first.toggle(first.getState().products[0]);
 await stale.toggle(stale.getState().products[1]);
 assert.equal(stale.getState().session.draft.items.length,0);
 assert.equal(stale.getState().uncertain,true);
 await stale.reconcile();
 assert.equal(stale.getState().session.draft.items[0].productId,'vega-8023');
 assert.equal(stale.getState().uncertain,false);
 await first.submit();await stale.reconcile();
 assert.equal(stale.getState().session.request?.id,first.getState().session.request.id);
 assert.equal((await f.staff('assigned-synthetic').list('55')).length,1);
});
