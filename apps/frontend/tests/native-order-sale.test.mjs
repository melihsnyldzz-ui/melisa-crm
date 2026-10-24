import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeOrderStore,recoverNativeOrder,submitNativeOrder,readNativeOrderSale,validateNativeOrderSale} from '../src/lib/nativeOrder.js';
import {nativeOrderReceiptCard,restoreNativeOrderHistory} from '../src/lib/nativeOrderHistory.js';

const uuid='00000000-0000-4000-8000-000000000001';
const body={requestId:uuid,conversationId:'55',peer:'905550000001',customerId:1,customerMatch:{basis:'exact-phone',phone:'905550000001',revision:'a'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:3,priceId:1,unitSourceId:1,tier:1,currency:'TRY',priceExact8:'125.50000000',priceSourceKey:'synthetic-price:1'}]};
function receipt(){return {id:3,documentNo:'SYNTHETIC-ORDER-3',customerName:'Örnek müşteri',request:structuredClone(body),status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:3,currency:'TRY',unitPriceExact4:'125.5000',lineTotalExact4:'376.5000'}],grandTotalExact4:'376.5000',amountTryExact4:'376.5000'};}
function view(state='FINALIZED'){
 const finalized=state==='FINALIZED';
 return {schemaVersion:'melisa-order-sale.v1',environment:'CLEAN_SYNTHETIC_TEST',environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',requestId:uuid,order:{id:'3',documentNo:'SYNTHETIC-ORDER-3',documentDate:'2026-10-22',customerId:'1',customerName:'Örnek müşteri',currency:'TRY',totalExact4:'376.5000'},state,sale:state==='NOT_CONVERTED'?null:{id:'7',documentNo:'SYNTHETIC-SALE-7',status:finalized?'finalized':'draft',customerId:'1',currency:'TRY',totalExact4:'376.5000',stockEffect:finalized,ledgerEffect:finalized,collectionEffect:false,reservationEffect:false},revision:'b'.repeat(64),capabilities:{canConvert:false,canFinalize:false}};
}
function fixture(){
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=createNativeOrderStore('synthetic-staff','55',storage);store.prepare(body,15);
 const saved=receipt(),options={store,nativeActorId:15,isCurrent:()=>true,readDetail:async id=>{assert.equal(id,uuid);return saved;}};
 return {data,storage,store,saved,options,confirm:()=>recoverNativeOrder(options)};
}

test('sale readback accepts only the three published states without changing the draft receipt',async t=>{
 for(const state of ['NOT_CONVERTED','DRAFT','FINALIZED'])await t.test(state,()=>{
  const saved=receipt(),before=JSON.stringify(saved),value=view(state);
  assert.equal(validateNativeOrderSale(value,saved),value);assert.equal(JSON.stringify(saved),before);
  const card=nativeOrderReceiptCard({...saved,orderSaleReadbackChecked:true,orderSaleReadback:value},{customer:'Örnek müşteri',owner:'Örnek personel'});
  assert.equal(card.id,uuid);assert.equal(card.documentNo,saved.documentNo);assert.equal(card.orderSaleReadback.sale?.id,state==='NOT_CONVERTED'?undefined:'7');
  assert.match(card.status,state==='FINALIZED'?/satışı tamamlandı/:state==='DRAFT'?/satış taslağı hazır/:/Henüz satışa aktarılmadı/);
 });
 await t.test('current ERP customer name may change while the original customer ID stays bound',()=>{const value=view();value.order.customerName='Örnek müşterinin yeni adı';assert.equal(validateNativeOrderSale(value,receipt()),value);});
});

test('sale readback rejects wrong binding, environment, money, state and effects',async t=>{
 const mutations=[
  ['schema',v=>v.schemaVersion='other'],['LIVE',v=>v.environment='LIVE'],['other environment',v=>v.environmentId='00000000-0000-4000-8000-000000000000'],
  ['other request',v=>v.requestId='00000000-0000-4000-8000-000000000002'],['other order',v=>v.order.id='4'],['numeric order ID',v=>v.order.id=3],
  ['other order document',v=>v.order.documentNo='OTHER'],['other customer',v=>v.order.customerId='2'],['empty customer name',v=>v.order.customerName=''],
  ['other currency',v=>v.order.currency='USD'],['changed order total',v=>v.order.totalExact4='376.5001'],['invalid date',v=>v.order.documentDate='2026-02-30'],
  ['unknown state',v=>v.state='UNKNOWN'],['missing linked sale',v=>v.sale=null],['wrong sale status',v=>v.sale.status='draft'],
  ['other linked customer',v=>v.sale.customerId='2'],['changed sale total',v=>v.sale.totalExact4='376.5001'],['changed sale currency',v=>v.sale.currency='EUR'],
  ['stock not finalized',v=>v.sale.stockEffect=false],['ledger not finalized',v=>v.sale.ledgerEffect=false],['payment claimed',v=>v.sale.collectionEffect=true],
  ['reservation claimed',v=>v.sale.reservationEffect=true],['invalid sale ID',v=>v.sale.id='0'],['unsafe sale ID',v=>v.sale.id='9223372036854775808'],
  ['empty sale number',v=>v.sale.documentNo=' '],['boolean string',v=>v.capabilities.canConvert='false'],['inconsistent capability',v=>v.capabilities.canFinalize=true],
  ['invalid revision',v=>v.revision='B'.repeat(64)],['revision array',v=>v.revision=['b'.repeat(64)]],['unknown root field',v=>v.untrusted=true]
 ];
 for(const [name,mutate] of mutations)await t.test(name,()=>{const value=view();mutate(value);assert.throws(()=>validateNativeOrderSale(value,receipt()));});
 await t.test('NOT_CONVERTED must have no sale',()=>{const value=view();value.state='NOT_CONVERTED';assert.throws(()=>validateNativeOrderSale(value,receipt()));});
 await t.test('DRAFT cannot claim a finalized effect',()=>{const value=view('DRAFT');value.sale.stockEffect=true;assert.throws(()=>validateNativeOrderSale(value,receipt()));});
});

test('sale readback refresh preserves original UUID and journal, with no new draft POST',async()=>{
 const f=fixture();await f.confirm();const preserved=[...f.data.values()][0];let posts=0;const reads=[];
 for(const state of ['NOT_CONVERTED','DRAFT','FINALIZED']){
  const saved=await submitNativeOrder({...f.options,payload:body,createDraft:async()=>{posts++;}});
  const result=await readNativeOrderSale({store:f.store,receipt:saved,nativeActorId:15,isCurrent:()=>true,readSale:async id=>{reads.push(id);return view(state);}});
  assert.equal(result.state,state);assert.equal([...f.data.values()][0],preserved);
 }
 assert.equal(posts,0);assert.deepEqual(reads,[uuid,uuid,uuid]);assert.deepEqual(f.store.read().payload,body);
 const restored=restoreNativeOrderHistory({actor:'synthetic-staff',conversations:[{id:55,name:'Örnek müşteri'}],storage:f.storage});
 assert.equal(restored.orders[0].readbackRequired,true);assert.equal(restored.orders[0].orderSaleReadback,undefined);
});

test('sale readback failures never mean no sale and never authorize a draft POST',async t=>{
 for(const status of [404,401,403,503,'network'])await t.test(String(status),async()=>{
  const f=fixture();await f.confirm();const preserved=[...f.data.values()][0],error=status==='network'?new TypeError('Failed to fetch'):Object.assign(Error('sidecar failed'),{status});let posts=0;
  await assert.rejects(()=>readNativeOrderSale({store:f.store,receipt:f.saved,nativeActorId:15,isCurrent:()=>true,readSale:async()=>{throw error;}}),e=>e===error);
  assert.equal([...f.data.values()][0],preserved);
  await submitNativeOrder({...f.options,payload:body,createDraft:async()=>{posts++;}});assert.equal(posts,0);
  const card=nativeOrderReceiptCard({...f.saved,orderSaleReadbackChecked:true,orderSaleReadback:null},{customer:'Örnek müşteri',owner:'Örnek personel'});
  assert.equal(card.status,'ERP satış durumu okunamadı');assert.equal(card.id,uuid);
 });
});

test('sale readback blocks wrong ERP actor and unconfirmed drafts before reading',async()=>{
 const f=fixture();let reads=0;const options={store:f.store,receipt:f.saved,nativeActorId:15,isCurrent:()=>true,readSale:async()=>{reads++;return view();}};
 await assert.rejects(()=>readNativeOrderSale(options),/taslağını/);await f.confirm();
 await assert.rejects(()=>readNativeOrderSale({...options,nativeActorId:17}),/hesabıyla/);assert.equal(reads,0);
});

test('sale readback ignores late results after close or identity scope change',async()=>{
 const f=fixture();await f.confirm();const preserved=[...f.data.values()][0];let active=true,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const result=readNativeOrderSale({store:f.store,receipt:f.saved,nativeActorId:15,isCurrent:()=>active,readSale:()=>gate});
 active=false;release(view());assert.equal(await result,null);assert.equal([...f.data.values()][0],preserved);
 let reads=0;assert.equal(await readNativeOrderSale({store:f.store,receipt:f.saved,nativeActorId:15,isCurrent:()=>false,readSale:async()=>{reads++;return view();}}),null);assert.equal(reads,0);
});

test('sale readback rejects a changed full journal envelope while a read is in flight',async t=>{
 for(const change of ['payload','resolved'])await t.test(change,async()=>{
  const f=fixture();await f.confirm();let release;const gate=new Promise(resolve=>{release=resolve;});
  const reading=readNativeOrderSale({store:f.store,receipt:f.saved,nativeActorId:15,isCurrent:()=>true,readSale:()=>gate});
  const key=[...f.data.keys()][0],record=JSON.parse(f.data.get(key));
  if(change==='payload')record.payload.items[0].quantity=2;else record.resolved=false;
  const changed=JSON.stringify(record);f.data.set(key,changed);release(view());
  await assert.rejects(()=>reading,/kaydı değişti/);assert.equal(f.data.get(key),changed);
 });
});
