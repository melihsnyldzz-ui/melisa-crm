import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewLedger,draftProduct,upsertDraftProduct,decimal4,quantityInPieces} from '../src/orderPreview.js';
const product={id:'TEST-PRODUCT',name:'TEST ürün',unitPrice:'100.0000',currency:'TRY',priceBasis:'per-item',cost:555,supplier:'PRIVATE'};
const input=products=>({accountId:'TEST-ACCOUNT',conversationId:'TEST-CUSTOMER-A',customer:'TEST müşteri',owner:'TEST temsilci',products});
const ledger=()=>createPreviewLedger({newId:()=> 'TEST-1'});
test('one item price 100 × two pieces is 200, with no ×8 or series conversion',()=>{
 const {order}=ledger().create(input([draftProduct(product,2)]));
 assert.equal(order.totals.TRY,'200.0000');assert.equal(order.total,'TRY 200,00');assert.equal(order.unit,'piece');
 assert.equal(order.items[0].quantity,2);assert.equal(order.erpPersisted,false);assert.equal(order.stockEffect,false);assert.equal(order.ledgerEffect,false);
});
test('decimal arithmetic preserves four places and rounds the displayed total once',()=>{
 const {order}=ledger().create(input([draftProduct({...product,unitPrice:'0.3333'},3),draftProduct({...product,id:'SECOND',unitPrice:'0.0001'},1)]));
 assert.equal(order.totals.TRY,'1.0000');assert.equal(order.total,'TRY 1,00');
});
test('missing/null/boolean/malformed prices never become zero',()=>{
 for(const unitPrice of [null,undefined,false,'',NaN,Infinity,-1,'unknown','1,25','1e2','0.12345'])assert.throws(()=>draftProduct({...product,unitPrice},1));
 assert.equal(draftProduct({...product,unitPrice:0},1).unitPrice,'0.0000');
});
test('structured unknown currency never falls back to TRY or a display price',()=>{
 for(const currency of [null,undefined,'','GBP','$','unknown'])assert.throws(()=>draftProduct({...product,currency,price:'€10,00'},1));
});
test('quantity must be positive safe integer pieces',()=>{
 for(const quantity of [0,-1,1.5,'2',null,false,NaN,Infinity,10000,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>quantityInPieces(quantity));
 assert.equal(quantityInPieces(2),2);
});
test('explicit series/pack price basis is rejected rather than multiplied',()=>{
 for(const priceBasis of ['series','pack','box'])assert.throws(()=>draftProduct({...product,priceBasis},2));
});
test('fictional legacy prices have explicit symbols and no unknown-currency fallback',()=>{
 assert.equal(draftProduct({id:'TEST',name:'TEST',price:'€8,90'},2).unitPrice,'8.9000');
 assert.equal(draftProduct({id:'TEST',name:'TEST',price:'$0,00'},1).currency,'USD');
 for(const price of ['8,90','?8,90','£8,90','€1.234,00'])assert.throws(()=>draftProduct({id:'TEST',name:'TEST',price},1));
});
test('cart repeated selection is idempotent and changing quantity replaces one row',()=>{
 const once=upsertDraftProduct([],product,2),twice=upsertDraftProduct(once,product,2);
 assert.equal(twice,once);const changed=upsertDraftProduct(twice,product,3);assert.equal(changed.length,1);assert.equal(changed[0].quantity,3);
});
test('duplicate preview clicks return the same id and row; no repeated local order',()=>{
 const l=ledger(),args=input([draftProduct(product,2)]),a=l.create(args),b=l.create(args);
 assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.order,b.order);
});
test('different conversation and account never reuse a previous customer preview',()=>{
 let n=0;const l=createPreviewLedger({newId:()=>String(++n)}),args=input([draftProduct(product,2)]);
 const a=l.create(args),b=l.create({...args,conversationId:'TEST-CUSTOMER-B'}),c=l.create({...args,accountId:'TEST-OTHER-ACCOUNT'});
 assert.notEqual(a.order.id,b.order.id);assert.notEqual(a.order.id,c.order.id);assert.equal(b.order.conversationId,'TEST-CUSTOMER-B');
});
test('logout clears ledger and empty/stale context cannot create an order',()=>{
 const l=ledger(),args=input([draftProduct(product,2)]);l.create(args);l.clear();assert.equal(l.create(args).created,true);
 for(const override of [{products:[]},{accountId:''},{conversationId:''}])assert.throws(()=>l.create({...args,...override}));
});
test('mixed currencies are displayed separately and never converted or summed',()=>{
 const {order}=ledger().create(input([draftProduct(product,2),draftProduct({...product,id:'OTHER',currency:'EUR',unitPrice:5},3)]));
 assert.deepEqual(order.totals,{EUR:'15.0000',TRY:'200.0000'});assert.match(order.total,/EUR 15,00 \/ TRY 200,00/);
});
test('preview serialization excludes private cost/supplier fields and duplicate lines',()=>{
 const l=ledger(),p=draftProduct(product,1),{order}=l.create(input([p]));
 assert.doesNotMatch(JSON.stringify(order),/PRIVATE|supplier|cost|555/);assert.throws(()=>l.create(input([p,p])));
 assert(Object.isFrozen(order.items));assert(Object.isFrozen(order.items[0]));
});
test('unsafe amounts/totals are rejected before an order enters the ledger',()=>{
 assert.throws(()=>decimal4('900719925474.0992'));assert.throws(()=>ledger().create(input([draftProduct({...product,unitPrice:'900719925474.0991'},2)])));
});
