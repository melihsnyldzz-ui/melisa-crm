import test from 'node:test';
import assert from 'node:assert/strict';
import {createPendingErpOrderStore,recoverPendingErpOrder,submitPendingErpOrder,validateErpOrderPayload,ERP_ORDER_TEST_DATABASE} from '../src/liveApi.js';
const id='00000000-0000-4000-8000-000000000001';
const payload={requestId:id,conversationId:'55',customerId:593,exchangeRate:1,items:[{stockCode:'0007',sourceId:'vega-12',quantity:2,unitPrice:196,currency:'TRY'}]};
const receipt={database:ERP_ORDER_TEST_DATABASE,requestId:id,status:'draft',customerId:593,erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,documentCurrency:'TRY',exchangeRate:1,grandTotal:392,items:[{...payload.items[0],lineTotal:392}]};
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const scoped=(db,actor='id:1')=>createPendingErpOrderStore(actor,'55',db);
test('commit plus lost GET survives dialog close and reload; recovery never posts a new UUID',async()=>{
 const db=storage(),writes=[];
 const first=scoped(db);
 await assert.rejects(()=>submitPendingErpOrder({store:first,payload,nativeActorId:7,createDraft:async body=>{writes.push(body);},readDetail:async()=>{throw Error('lost GET');},isCurrent:()=>true}),/lost GET/);
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse([...db.data.values()][0]).payload,payload);
 const reopened=scoped(db);
 const order=await submitPendingErpOrder({store:reopened,payload:{...payload,requestId:'00000000-0000-4000-8000-000000000099'},nativeActorId:7,createDraft:async body=>writes.push(body),readDetail:async requestId=>{assert.equal(requestId,id);return receipt;},isCurrent:()=>true});
 assert.equal(order,receipt);assert.equal(writes.length,1);assert.equal(reopened.read().resolved,true);
 assert.equal(scoped(db).read().payload.requestId,id);
});
test('404 resumes only the original frozen payload and UUID; uncertain reads never retry writes',async()=>{
 const db=storage(),store=scoped(db);store.prepare(payload,7);
 let reads=0,writes=[];
 const result=await submitPendingErpOrder({store,payload:{...payload,requestId:'changed'},nativeActorId:7,readDetail:async()=>{if(++reads===1)throw Object.assign(Error('not found'),{status:404});return receipt;},createDraft:async body=>writes.push(body),isCurrent:()=>true});
 assert.equal(result,receipt);assert.deepEqual(writes,[payload]);assert.equal(reads,2);
 await assert.rejects(()=>submitPendingErpOrder({store,payload,nativeActorId:7,readDetail:async()=>{throw Error('timeout');},createDraft:async body=>writes.push(body),isCurrent:()=>true}),/timeout/);assert.equal(writes.length,1);
});
test('CRM actor isolation, original ERP actor binding and storage fields exclude secrets',async()=>{
 const db=storage(),store=scoped(db);store.prepare({...payload,accessToken:'PRIVATE-TOKEN',password:'PRIVATE-PASSWORD',items:[{...payload.items[0],name:'PRIVATE-NAME'}]},7);
 assert.equal(scoped(db,'id:2').read(),null);
 let reads=0;
 await assert.rejects(()=>recoverPendingErpOrder({store,nativeActorId:8,readDetail:async()=>{reads++;return receipt;},isCurrent:()=>true}),/farklı ERP hesabına/);assert.equal(reads,0);
 assert(![...db.data.values()].some(text=>/PRIVATE|accessToken|password|name/.test(text)));
 assert(![...db.data.keys()].some(key=>/PRIVATE/.test(key)));
});
test('a late receipt after close cannot resolve persisted state or start a new intent',async()=>{
 const db=storage(),store=scoped(db);store.prepare(payload,7);
 const result=await recoverPendingErpOrder({store,nativeActorId:7,readDetail:async()=>receipt,isCurrent:()=>false});
 assert.equal(result.receipt,null);assert.equal(store.read().resolved,false);assert.throws(()=>store.newIntent(7),/henüz doğrulanmadı/);
 await recoverPendingErpOrder({store,nativeActorId:7,readDetail:async()=>receipt,isCurrent:()=>true});store.newIntent(7);assert.equal(store.read(),null);
});
test('prewrite invalid rates, bounds, precision, duplicates and failed storage never freeze or post',async()=>{
 const db=storage(),store=scoped(db);let writes=0;
 const invalid=[{exchangeRate:2},{exchangeRate:10001},{exchangeRate:1.123456789},{items:[{...payload.items[0],unitPrice:1.12345}]},{items:[{...payload.items[0],unitPrice:1000001}]},{items:[payload.items[0],payload.items[0]]},{items:Array.from({length:51},(_,i)=>({...payload.items[0],sourceId:`vega-${i}`,stockCode:String(i)}))}];
 for(const change of invalid){const bad={...payload,...change};assert.throws(()=>validateErpOrderPayload(bad));await assert.rejects(()=>submitPendingErpOrder({store,payload:bad,nativeActorId:7,readDetail:async()=>receipt,createDraft:async()=>{writes++;},isCurrent:()=>true}));assert.equal(store.read(),null);}
 const failed=scoped({getItem:()=>null,setItem(){throw Error('storage unavailable');},removeItem(){}});
 await assert.rejects(()=>submitPendingErpOrder({store:failed,payload,nativeActorId:7,readDetail:async()=>receipt,createDraft:async()=>{writes++;},isCurrent:()=>true}),/storage unavailable/);assert.equal(writes,0);
});
