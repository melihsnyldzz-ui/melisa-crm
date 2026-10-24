import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeOrderStore} from '../src/lib/nativeOrder.js';
import {nativeOrderReceiptCard,restoreNativeOrderHistory} from '../src/lib/nativeOrderHistory.js';

const requestId='00000000-0000-4000-8000-000000000001';
const payload={requestId,conversationId:'55',peer:'905550000001',customerId:8,customerMatch:{basis:'exact-phone',phone:'905550000001',revision:'a'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:3,priceId:9,unitSourceId:2,tier:1,currency:'TRY',priceExact8:'12.34567890',priceSourceKey:'synthetic'}]};
const conversation={id:55,name:'Örnek müşteri',owner:'Örnek personel'};
function fixture(){const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};return {data,storage,store:createNativeOrderStore('actor:1',55,storage)};}
test('reload restores original UUID and exact rounded totals without claiming a new ERP read',()=>{
 const f=fixture();f.store.prepare(payload,7);f.store.resolved(7);
 const restored=restoreNativeOrderHistory({actor:'actor:1',conversations:[conversation],storage:f.storage});
 assert.equal(restored.orders.length,1);assert.deepEqual(restored.unreadable,[]);
 const card=restored.orders[0];assert.equal(card.requestId,requestId);assert.equal(card.conversationId,'55');assert.equal(card.total,'TRY 37,04');
 assert.equal(card.readbackRequired,true);assert.equal(card.status,'ERP kaydı yeniden okunmalı');assert.equal(card.erpPersisted,undefined);
 assert.equal(createNativeOrderStore('actor:1',55,f.storage).read().payload.requestId,requestId);
});
test('different actors and no longer visible conversations never expose saved draft cards',()=>{
 const f=fixture();f.store.prepare(payload,7);
 assert.deepEqual(restoreNativeOrderHistory({actor:'actor:2',conversations:[conversation],storage:f.storage}).orders,[]);
 assert.deepEqual(restoreNativeOrderHistory({actor:'actor:1',conversations:[],storage:f.storage}).orders,[]);
 f.storage.setItem('melisa-crm-native-order-v2:actor%3A1:56','not json');
 const result=restoreNativeOrderHistory({actor:'actor:1',conversations:[conversation,{id:56}],storage:f.storage});
 assert.equal(result.orders[0].requestId,requestId);assert.deepEqual(result.unreadable,['56']);
});
test('confirmed receipt card links to the original conversation and retains decimal display precision',()=>{
 const receipt={id:100,documentNo:'SYNTHETIC-100',request:payload,customerName:'ERP örnek müşteri',grandTotalExact4:'37.0371',items:payload.items};
 const card=nativeOrderReceiptCard(receipt,{customer:conversation.name,owner:conversation.owner});
 assert.equal(card.id,requestId);assert.equal(card.conversationId,'55');assert.equal(card.customer,'ERP örnek müşteri');assert.equal(card.total,'TRY 37,04');assert.equal(card.readbackRequired,false);
 const f=fixture();f.store.prepare(payload,7);f.store.resolved(7);f.store.newIntent(7);
 assert.deepEqual(restoreNativeOrderHistory({actor:'actor:1',conversations:[conversation],storage:f.storage}).orders,[]);
});
