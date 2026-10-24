import test from 'node:test';
import assert from 'node:assert/strict';
import {liveApi,ERP_ORDER_TEST_DATABASE,validateErpOrderContext,erpOrderPayload,validateErpDraftReceipt} from '../src/liveApi.js';
const requestId='00000000-0000-4000-8000-000000000001';
const line={id:'vega-12',sourceId:'vega-12',stockCode:'0007',name:'Original catalogue name',currency:'TRY',unitPrice:196};
const context={database:ERP_ORDER_TEST_DATABASE,environment:'CANONICAL_TEST',purpose:'crm-order-draft-only',customer:{id:593,code:'TEST-V70-20260929-C'},products:[{...line,erpProductId:8}]};
const submitted=erpOrderPayload(requestId,55,context,[line],[2],1);
const receipt={database:ERP_ORDER_TEST_DATABASE,requestId,status:'draft',customerId:593,erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,documentCurrency:'TRY',exchangeRate:1,grandTotal:392,items:[{...submitted.items[0],lineTotal:392}]};
test('catalogue source/SKU/price/currency must match exactly; display names never map products',()=>{
  assert.equal(validateErpOrderContext(context,[line]),context);
  for(const change of [{sourceId:'vega-13'},{stockCode:'7'},{currency:'USD'},{unitPrice:195}])assert.throws(()=>validateErpOrderContext(context,[{...line,...change}]));
  for(const change of [{database:'OTHER'},{environment:'LIVE'},{customer:{id:594,code:'OTHER'}},{products:[line,line]}])assert.throws(()=>validateErpOrderContext({...context,...change},[line]));
  assert.deepEqual(Object.keys(submitted.items[0]).sort(),['currency','quantity','sourceId','stockCode','unitPrice']);
  assert.equal(submitted.items[0].stockCode,'0007');assert(!JSON.stringify(submitted).includes(line.name));
  assert.throws(()=>erpOrderPayload(requestId,56,context,[line],[2],1));
});
test('only a reread persisted draft with exact quantities, prices, totals and no effects is accepted',()=>{
  assert.equal(validateErpDraftReceipt(receipt,submitted),receipt);
  for(const change of [{requestId:'other'},{status:'confirmed'},{customerId:1},{database:'OTHER'},{grandTotal:393},{stockEffect:true},{ledgerEffect:true},{erpPersisted:false},{items:[{...receipt.items[0],quantity:3}]},{items:[{...receipt.items[0],sourceId:'vega-13'}]}])assert.throws(()=>validateErpDraftReceipt({...receipt,...change},submitted));
});
test('context/detail keep native bearer in a header and never retry an ERP write failure',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:{}});});
  await liveApi.erpContext('synthetic-crm','synthetic-erp');await liveApi.erpDraftDetail('synthetic-crm','synthetic-erp',requestId);
  assert.equal(calls[0].url,'/api/live/crm/erp/context');assert.equal(calls[1].options.headers['x-erp-token'],'synthetic-erp');assert(!calls.some(call=>call.url.includes('synthetic')));
  let writes=0;
  t.mock.method(globalThis,'fetch',async()=>{writes++;throw new Error('unconfirmed');});await assert.rejects(()=>liveApi.erpDraft('synthetic-crm','synthetic-erp',submitted),/unconfirmed/);assert.equal(writes,1);
});
