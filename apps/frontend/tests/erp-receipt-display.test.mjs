import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('linked sale renderer distinguishes finalization, draft, no sale and unreadable result',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/erp-sale-display-test.mjs';
 try{
  await build({entryPoints:['src/ERPOrderDialog.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react']});
  const {NativeOrderReceiptDisplay,OrderDraftSteps}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  const steps=renderToStaticMarkup(React.createElement(OrderDraftSteps,{linkedSales:true}));assert.match(steps,/Satışa aktarma ve onay ERP’den yapılır/);assert.doesNotMatch(steps,/cari bakiye değişmez/);
  const request={requestId:'00000000-0000-4000-8000-000000000001',conversationId:'55',peer:'905550000001',customerId:1,customerMatch:{basis:'exact-phone',phone:'905550000001',revision:'a'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:3,priceId:1,unitSourceId:1,tier:1,currency:'TRY',priceExact8:'125.50000000',priceSourceKey:'synthetic'}]};
  const receipt={id:3,documentNo:'SYNTHETIC-ORDER',customerName:'Örnek müşteri',request,status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,grandTotalExact4:'376.5000',amountTryExact4:'376.5000',items:[{productId:1,stockCode:'SYNTHETIC-1',quantity:3,currency:'TRY',unitPriceExact4:'125.5000',lineTotalExact4:'376.5000'}]};
  const value={schemaVersion:'melisa-order-sale.v1',environment:'CLEAN_SYNTHETIC_TEST',environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',requestId:request.requestId,order:{id:'3',documentNo:receipt.documentNo,documentDate:'2026-10-22',customerId:'1',customerName:receipt.customerName,currency:'TRY',totalExact4:'376.5000'},state:'FINALIZED',sale:{id:'7',documentNo:'SYNTHETIC-SALE',status:'finalized',customerId:'1',currency:'TRY',totalExact4:'376.5000',stockEffect:true,ledgerEffect:true,collectionEffect:false,reservationEffect:false},revision:'b'.repeat(64),capabilities:{canConvert:false,canFinalize:false}};
  const render=readback=>renderToStaticMarkup(React.createElement(NativeOrderReceiptDisplay,{receipt,saleReadback:readback}));
  const finalized=render({state:'ready',value});assert.match(finalized,/ERP satışı tamamlandı/);assert.match(finalized,/Satış belgesi: SYNTHETIC-SALE/);assert.match(finalized,/TRY 376,50/);assert.match(finalized,/müşteri hesabı hareketi ERP’den doğrulandı/);assert.match(finalized,/oluşturulurken stok/);assert.doesNotMatch(finalized,/Onayla|Satışı oluştur/);
  const draft=structuredClone(value);draft.state='DRAFT';draft.sale.status='draft';draft.sale.stockEffect=false;draft.sale.ledgerEffect=false;
  const draftHtml=render({state:'ready',value:draft});assert.match(draftHtml,/ERP satış taslağı hazır/);assert.doesNotMatch(draftHtml,/ERP satışı tamamlandı/);
  const missing={...value,state:'NOT_CONVERTED',sale:null};assert.match(render({state:'ready',value:missing}),/Henüz satışa aktarılmadı/);
  const unread=render({state:'error',value:null});assert.match(unread,/Güncel satış durumu okunamadı/);assert.doesNotMatch(unread,/Henüz satışa aktarılmadı|ERP satışı tamamlandı/);
  assert.match(render({state:'loading',value:null}),/satış durumu okunuyor/);
  assert.match(render({state:'ready',value:{...value,requestId:'wrong'}}),/sonucu bu siparişle doğrulanamadı/);
 }finally{rmSync(file,{force:true});}
});

test('actual native receipt labels use two decimals while exact totals retain native precision',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/erp-receipt-display-test.mjs';
 try{
  await build({entryPoints:['src/ERPOrderDialog.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react']});
  const {NativeOrderReceiptDisplay}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  const receipt={documentNo:'SYNTHETIC',customerName:'Synthetic customer',request:{documentCurrency:'TRY'},grandTotalExact4:'457.2468',items:[{productId:7,stockCode:'TEST7',quantity:2,currency:'TRY',unitPriceExact4:'228.6234',lineTotalExact4:'457.2468'}]};
  const before=JSON.stringify(receipt),html=renderToStaticMarkup(React.createElement(NativeOrderReceiptDisplay,{receipt}));
  assert.match(html,/TRY 457,25/);assert.match(html,/2 birim × TRY 228,62 = 457,25/);assert.doesNotMatch(html,/228\.6234|457\.2468/);
  assert.equal(JSON.stringify(receipt),before);assert.equal(Number(receipt.items[0].unitPriceExact4)*receipt.items[0].quantity,Number(receipt.grandTotalExact4));
  receipt.grandTotalExact4='228.5000';receipt.items[0]={...receipt.items[0],quantity:1,unitPriceExact4:'228.5000',lineTotalExact4:'228.5000'};
  assert.match(renderToStaticMarkup(React.createElement(NativeOrderReceiptDisplay,{receipt})),/TRY 228,50/);
 }finally{rmSync(file,{force:true});}
});
