import test from 'node:test';
import assert from 'node:assert/strict';
import {nextIncomingTranslation} from '../src/automaticTranslation.js';
import {selectedSaleLines,selectionMessage} from '../src/catalog/productActions.js';
test('automatic translation only queues recent incoming text and never retries cached errors',()=>{
 const messages=[{id:1,direction:'incoming',text:'old'},{id:2,direction:'outgoing',text:'reply'},{id:3,direction:'incoming',text:'hello'},{id:4,direction:'incoming',text:''}];
 assert.equal(nextIncomingTranslation(messages,{},55).id,3);
 assert.equal(nextIncomingTranslation(messages,{'55:3':{error:'offline'}},55),undefined);
 assert.equal(nextIncomingTranslation(messages,{'54:3':{translatedText:'merhaba'}},55).id,3);
});
test('sale messages preserve leading zero SKU and actual per-piece currency without conversion',()=>{
 const product={id:'vega-12',code:'0007',name:'Tulum',currency:'USD',prices:{USD:12.2},stock:0};
 assert.equal(selectionMessage([product]),'0007 · Tulum');
 assert.match(selectionMessage([product],true),/0007 · Tulum · USD 12.2/);
 assert.equal(selectedSaleLines([product])[0].stockCode,'0007');
 for(const changed of [{currency:null},{prices:{USD:0}},{prices:{USD:Infinity}}])assert.throws(()=>selectedSaleLines([{...product,...changed}]));
});
import {exportModel} from '../src/catalog/model.js';
test('recorded-price PDFs use the authenticated SQL catalogue prices and keep stock unknown',()=>{
 const product={id:'vega-12',code:'0007',name:'Tulum',brand:'Melisa',currency:'TRY',prices:{TRY:12.2},months:[],counts:[],stock:-2,stockVerified:false,priceVerified:false,catalogVersion:'existing-stock-v1',fetchedAt:'2026-10-03T16:00:00Z',priceBasis:'piece'};
 const model=exportModel([product.id],{currency:'TRY',showPrices:true,recordedPrices:true},[product]);
 assert.equal(model.priceExportAllowed,true);assert.equal(model.items[0].price,12.2);assert.equal(model.items[0].stock,null);assert.equal(model.items[0].stockVerified,false);assert.match(model.notice,/Kayıtlı satış fiyatları/);
 for(const changed of [{catalogVersion:undefined},{fetchedAt:null},{currency:'USD'},{prices:{TRY:0}},{prices:{TRY:Infinity}}])assert.equal(exportModel([product.id],{currency:'TRY',showPrices:true,recordedPrices:true},[{...product,...changed}]).priceExportAllowed,false);
 assert.equal(exportModel([product.id],{currency:'USD',showPrices:true,recordedPrices:true},[product]).priceExportAllowed,false);
});
