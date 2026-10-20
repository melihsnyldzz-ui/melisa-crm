import test from 'node:test';
import assert from 'node:assert/strict';
import {createPendingErpOrderStore,recoverPendingErpOrder,submitPendingErpOrder,validateErpOrderPayload,ERP_ORDER_TEST_DATABASE} from '../src/liveApi.js';
import {createNativeOrderStore,recoverNativeOrder,submitNativeOrder,validateNativeOrder,validateNativeSource} from '../src/lib/nativeOrder.js';
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

// Native v2 journal races use only an in-memory browser store and deferred calls.
const nativePayload={requestId:id,conversationId:'55',peer:'905550000001',customerId:8,customerMatch:{basis:'exact-phone',phone:'905550000001',revision:'a'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:2,priceId:9,unitSourceId:2,tier:1,currency:'TRY',priceExact8:'25.00000000',priceSourceKey:'synthetic'}]};
const nativeSource={runId:'PRODUCT-00000000-0000-4000-8000-000000000001',sourceAsOf:'2026-10-20',sourceHash:'a'.repeat(64),planHash:'b'.repeat(64),bindingsHash:'c'.repeat(64),snapshotHash:'d'.repeat(64),actualT1:false,counts:{products:1,prices:1}};
const nativeKey='melisa-crm-native-order-v2:actor%3A1:55';
const clone=value=>JSON.parse(JSON.stringify(value));
const notFound=()=>Object.assign(Error('not found'),{status:404});
function nativeReceipt(body=nativePayload,source=nativeSource){return {request:clone(body),currentSource:clone(source),sourceMetadataStatus:'sealed-current-source',status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:2,currency:'TRY',unitPriceExact4:'25.0000',lineTotalExact4:'50.0000'}],grandTotalExact4:'50.0000',amountTryExact4:'50.0000'};}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function nativeFixture(){const db=storage(),store=createNativeOrderStore('actor:1','55',db);store.prepare(nativePayload,7,nativeSource);return {db,store,options:{store,nativeActorId:7,payload:nativePayload,expectedSource:nativeSource,isCurrent:()=>true}};}
function driftNativeJournal(f,change){
 const record=f.store.read();
 if(change==='deleted'){f.db.removeItem(nativeKey);return;}
 if(change==='malformed'){f.db.setItem(nativeKey,'not json');return;}
 if(change==='uuid')record.payload.requestId='00000000-0000-4000-8000-000000000002';
 if(change==='customer')record.payload.customerId=9;
 if(change==='match-revision')record.payload.customerMatch.revision='e'.repeat(64);
 if(change==='pricing-witness'){record.payload.pricingContract='melisa-crm-draft-pricing.v1';record.payload.items[0].pricingWitness={origin:'MANUAL',versionId:'3',sourcePriceExact8:'24.00000000'};}
 if(change==='source')record.expectedSource.snapshotHash='e'.repeat(64);
 if(change==='resolved')record.resolved=!record.resolved;
 if(change==='actor')record.nativeActorId='8';
 validateNativeOrder(record.payload);validateNativeSource(record.expectedSource);f.db.setItem(nativeKey,JSON.stringify(record));
}

test('native recovery never resolves or returns A after its journal envelope changes during GET',async t=>{
 for(const change of ['uuid','customer','match-revision','pricing-witness','source','resolved','actor','deleted','malformed'])await t.test(change,async()=>{
  const f=nativeFixture(),gate=deferred(),reads=[];
  const pending=recoverNativeOrder({...f.options,readDetail:requestId=>{reads.push(requestId);return gate.promise;}});
  driftNativeJournal(f,change);const raw=f.db.getItem(nativeKey);
  const rejected=assert.rejects(pending);gate.resolve(nativeReceipt());await rejected;
  assert.deepEqual(reads,[id]);assert.equal(f.db.getItem(nativeKey),raw);
 });
});

test('native 404 cannot POST a frozen A when the journal changed or disappeared during GET',async t=>{
 for(const change of ['uuid','source','resolved','deleted'])await t.test(change,async()=>{
  const f=nativeFixture(),gate=deferred(),reads=[],writes=[];
  const pending=submitNativeOrder({...f.options,readDetail:requestId=>{reads.push(requestId);return gate.promise;},createDraft:async body=>writes.push(body)});
  driftNativeJournal(f,change);const raw=f.db.getItem(nativeKey);
  const rejected=assert.rejects(pending);gate.reject(notFound());await rejected;
  assert.deepEqual(reads,[id]);assert.deepEqual(writes,[]);assert.equal(f.db.getItem(nativeKey),raw);
 });
 await t.test('replacement in the microtask between recovery and submit also prevents POST',async()=>{
  const f=nativeFixture(),gate=deferred(),writes=[];
  const pending=submitNativeOrder({...f.options,readDetail:()=>gate.promise,createDraft:async body=>writes.push(body)});
  const rejected=assert.rejects(pending);gate.reject(notFound());
  let raw;queueMicrotask(()=>{driftNativeJournal(f,'uuid');raw=f.db.getItem(nativeKey);});
  await rejected;assert.deepEqual(writes,[]);assert.equal(f.db.getItem(nativeKey),raw);
 });
});

test('native submit never adopts B after an in-flight POST succeeds or loses its response',async t=>{
 for(const intent of ['pending','new'])for(const outcome of ['success','uncertain'])for(const change of ['uuid','source','resolved','deleted'])await t.test(`${intent} ${outcome}: ${change}`,async()=>{
  const f=nativeFixture(),gate=deferred(),posted=deferred(),reads=[],writes=[];
  if(intent==='new')f.db.removeItem(nativeKey);
  const pending=submitNativeOrder({...f.options,readDetail:async requestId=>{reads.push(requestId);if(intent==='pending'&&reads.length===1)throw notFound();const current=f.store.read();return nativeReceipt(current?.payload||nativePayload,current?.expectedSource||nativeSource);},createDraft:body=>{writes.push(clone(body));posted.resolve();return gate.promise;}});
  await posted.promise;driftNativeJournal(f,change);const raw=f.db.getItem(nativeKey);
  const rejected=assert.rejects(pending);if(outcome==='success')gate.resolve();else gate.reject(Error('POST response lost'));await rejected;
  assert.deepEqual(writes,[nativePayload]);assert.deepEqual(reads,intent==='pending'?[id]:[]);assert.equal(f.db.getItem(nativeKey),raw);
 });
});

test('native new intent cannot delete B while the same store still holds the resolved A receipt',async t=>{
 for(const change of ['uuid','customer','source','deleted'])await t.test(change,async()=>{
  const f=nativeFixture();await recoverNativeOrder({...f.options,readDetail:async()=>nativeReceipt()});
  driftNativeJournal(f,change);const raw=f.db.getItem(nativeKey);
  assert.throws(()=>f.store.newIntent(7));assert.equal(f.db.getItem(nativeKey),raw);
 });
});

test('native readback remains bound through the public recovery and submit continuations',async t=>{
 for(const operation of ['recover','existing submit','new submit','uncertain submit'])for(const change of ['journal','closed context'])await t.test(`${operation}: ${change}`,async()=>{
  const f=nativeFixture(),gate=deferred(),reading=deferred();let current=true;
  if(operation==='new submit'||operation==='uncertain submit')f.db.removeItem(nativeKey);
  const options={...f.options,isCurrent:()=>current,readDetail:()=>{reading.resolve();return gate.promise;},createDraft:async()=>{if(operation==='uncertain submit')throw Error('POST response lost');}};
  const pending=operation==='recover'?recoverNativeOrder(options):submitNativeOrder(options);
  await reading.promise;
  const rejected=change==='journal'?assert.rejects(pending):null;gate.resolve(nativeReceipt());
  let raw;queueMicrotask(()=>{if(change==='journal')driftNativeJournal(f,'uuid');else current=false;raw=f.db.getItem(nativeKey);});
  if(rejected)await rejected;else{const result=await pending;assert.equal(operation==='recover'?result.receipt:result,null);}
  assert.equal(f.db.getItem(nativeKey),raw);
 });
});

test('native unchanged journal keeps recovery, frozen-UUID retry, resolved 404 and close guards',async t=>{
 await t.test('reload recovers the same UUID with no POST, then permits a new intent',async()=>{
  const f=nativeFixture(),gate=deferred();let writes=0;
  const reopened=createNativeOrderStore('actor:1','55',f.db);
  const pending=submitNativeOrder({...f.options,store:reopened,readDetail:()=>gate.promise,createDraft:async()=>{writes++;}});
  gate.resolve(nativeReceipt());const result=await pending;
  assert.deepEqual(result,nativeReceipt());assert.equal(writes,0);assert.equal(reopened.read().resolved,true);
  reopened.newIntent(7);assert.equal(reopened.read(),null);
 });
 await t.test('a missing pending record retries only its original complete payload',async()=>{
  const f=nativeFixture(),writes=[];let reads=0;
  const result=await submitNativeOrder({...f.options,readDetail:async requestId=>{assert.equal(requestId,id);if(++reads===1)throw notFound();return nativeReceipt();},createDraft:async body=>writes.push(clone(body))});
  assert.deepEqual(result,nativeReceipt());assert.deepEqual(writes,[nativePayload]);assert.equal(reads,2);assert.equal(f.store.read().resolved,true);
 });
 await t.test('a resolved record returning 404 never POSTs again',async()=>{
  const f=nativeFixture();f.store.resolved(7);const raw=f.db.getItem(nativeKey);let writes=0;
  await assert.rejects(()=>submitNativeOrder({...f.options,readDetail:async()=>{throw notFound();},createDraft:async()=>{writes++;}}),/Doğrulanmış taslak/);
  assert.equal(writes,0);assert.equal(f.db.getItem(nativeKey),raw);
 });
 await t.test('a closed context ignores a late receipt and a late 404 without writing',async()=>{
  for(const missing of [false,true]){
   const f=nativeFixture(),gate=deferred();let current=true,writes=0;
   const pending=submitNativeOrder({...f.options,isCurrent:()=>current,readDetail:()=>gate.promise,createDraft:async()=>{writes++;}});
   current=false;driftNativeJournal(f,'uuid');const raw=f.db.getItem(nativeKey);
   if(missing)gate.reject(notFound());else gate.resolve(nativeReceipt());
   assert.equal(await pending,null);assert.equal(writes,0);assert.equal(f.db.getItem(nativeKey),raw);
  }
 });
});
