import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startSyntheticApp} from './server.mjs';
import {nativeOrderPayload,validateNativeReceipt} from '../../apps/frontend/src/lib/nativeOrder.js';
import {customers,products,conversations,currentSource} from './fixtures.mjs';

const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../work/cloud-test');
const requestId='00000000-0000-4000-8000-000000000001';
const input=()=>nativeOrderPayload(requestId,conversations[0],customers[0],{basis:'exact-phone'},products.map(p=>({productId:p.erpProductId,stockCode:p.stockCode,currency:'TRY',priceId:Number(p.salePrices[0].id),unitSourceId:1,priceExact:p.priceExact,priceSourceKey:p.priceSourceKey})),[3,2],'1.00000000');
async function fixture(t){
 await mkdir(work,{recursive:true});
 const directory=await mkdtemp(path.join(work,'http-test-')),options={synthetic:true,withFrontend:false,storeFile:path.join(directory,'native-orders.json'),infoFile:path.join(directory,'server.json')};
 let app=await startSyntheticApp(options);
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
 const call=async(route,{method='GET',token,erpToken,body}={})=>{const response=await fetch(app.origin+route,{method,headers:{origin:app.origin,...(token?{authorization:'Bearer '+token}:{}),...(erpToken?{'x-erp-token':erpToken}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(response.headers.get('x-melisa-synthetic'),'1');return {status:response.status,...await response.json()};};
 const login=async(username='manager')=>{const r=await call('/api/live/auth/login',{method:'POST',body:{username,password:'synthetic-only'}});assert.equal(r.status,200);return r.data.accessToken;};
 const erp=async(token,username='erp-test')=>{const r=await call('/api/live/crm/erp/login',{method:'POST',token,body:{username,password:'synthetic-only'}});assert.equal(r.status,200);return r.data.accessToken;};
 return {call,login,erp,restart:async()=>{await app.close();app=await startSyntheticApp(options);}};
}

test('local application HTTP persists one native draft, checks both authorities and survives server restart',async t=>{
 const f=await fixture(t),token=await f.login(),erpToken=await f.erp(token),body=input(),route='/api/live/crm/erp/v2/drafts';
 assert.equal((await f.call(route+'/'+requestId)).status,401);
 assert.equal((await f.call(route,{method:'POST',token,body})).status,401);
 const matched=await f.call('/api/live/crm/erp/v2/customers?conversationId=55&phone=905550000001',{token,erpToken});assert.equal(matched.status,200);assert.equal(matched.data.entries[0].id,701);
 assert.equal((await f.call('/api/live/crm/erp/v2/customers?conversationId=55&phone=905550000002',{token,erpToken})).status,403);
 const wrongCustomer=structuredClone(body);wrongCustomer.customerId=702;assert.equal((await f.call(route,{method:'POST',token,erpToken,body:wrongCustomer})).status,409);
 const wrongPrice=structuredClone(body);wrongPrice.items[0].priceExact8='195.00000000';assert.equal((await f.call(route,{method:'POST',token,erpToken,body:wrongPrice})).status,409);
 const created=await f.call(route,{method:'POST',token,erpToken,body});assert.equal(created.status,200);validateNativeReceipt(created.data,body,currentSource);assert.equal(created.data.grandTotalExact4,'759.0000');
 const duplicate=await f.call(route,{method:'POST',token,erpToken,body});assert.equal(duplicate.data.documentNo,created.data.documentNo);
 const conflict=structuredClone(body);conflict.items[0].quantity=4;assert.equal((await f.call(route,{method:'POST',token,erpToken,body:conflict})).status,409);
 const other=await f.erp(token,'erp-other');assert.equal((await f.call(route+'/'+requestId,{token,erpToken:other})).status,403);
 assert.equal((await f.call('/api/live/__synthetic/status',{token})).data.draftCount,1);
 await f.restart();const renewed=await f.login(),native=await f.erp(renewed),detail=await f.call(route+'/'+requestId,{token:renewed,erpToken:native});assert.equal(detail.status,200);assert.deepEqual(detail.data,created.data);
 assert.equal((await f.call('/api/live/__synthetic/status',{token:renewed})).data.draftCount,1);
 assert.equal((await f.call('/api/live/crm/conversations/55/messages',{method:'POST',token:renewed,body:{text:'never sent'}})).status,404);
});

test('runner refuses missing opt-in, fixed listeners, journals outside work, outbound HTTP and sockets',async()=>{
 await assert.rejects(()=>startSyntheticApp(),/EXPLICIT_SYNTHETIC/);
 await assert.rejects(()=>startSyntheticApp({synthetic:true,port:4173}),/EXPLICIT_SYNTHETIC/);
 await assert.rejects(()=>startSyntheticApp({synthetic:true,storeFile:'/tmp/outside.json'}),/SYNTHETIC_WORK/);
 assert.throws(()=>fetch('https://example.com/'),/guard rejected external/);
 const {Socket}=await import('node:net');assert.throws(()=>new Socket().connect(1433,'127.0.0.1'),/guard rejected external/);
});

test('customer capability requires the issuing normal session and is revoked by logout',async t=>{
 const f=await fixture(t),token=await f.login();
 const grant=await f.call('/api/live/crm/customer-product-requests/sessions',{method:'POST',token,body:{conversationId:'55'}});
 assert.equal(grant.status,200);assert.match(grant.data.capability,/^[A-Za-z0-9_-]{43}$/);
 const route='/api/live/customer-product-requests/session';
 assert.equal((await f.call(route,{token:grant.data.capability})).status,200);
 assert.equal((await f.call('/api/live/auth/logout',{method:'POST',token,body:{}})).status,200);
 assert.equal((await f.call(route,{token:grant.data.capability})).status,401);
});
