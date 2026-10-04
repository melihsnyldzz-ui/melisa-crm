import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeSalesProducts,assertSalesProductCurrent,salesProductDraft} from '../src/lib/salesProducts.js';
import {createSalesDraftFlow} from '../src/lib/salesDraft.js';
import {createSalesPhotoSession} from '../src/lib/salesPhotos.js';
import {liveApi} from '../src/liveApi.js';

const baseTime=Date.parse('2026-10-04T20:00:00Z');
const product=()=>({id:'vega-7',stockCode:'0007',productName:'Gerçek kaynak ürünü',salePrice:196,currency:'TRY',priceBasis:'per-item',photoEligible:true});
const facts=()=>({source:'melisa-existing-erp-stock-read',catalogVersion:'existing-stock-v1',fetchedAt:new Date(baseTime).toISOString(),expiresAt:new Date(baseTime+300000).toISOString(),sourceDatabaseVerified:true,stockFreshness:'unverified',seriesVerified:false});
const response=()=>({action:'recommend',reply:'Please review this product.',summaryTr:'Ürünü öneriyor.',conversationId:'55',conversationRevision:'a'.repeat(64),generatedAt:new Date(baseTime).toISOString(),mode:'copilot',requiresHumanReview:true,autoSend:false,erpWrite:false,recommendedProducts:[product()],catalogFacts:facts()});
const envelope=()=>({success:true,data:{...product(),photoStatus:'guarded-path',photoPath:'/crm/catalog/products/vega-7/photo',priceStatus:'recorded',priceBasisStatus:'user-confirmed',sourceUpdatedAt:null,pricedDocumentEligible:false,pricedDocumentBlockReason:'SOURCE_FRESHNESS_UNVERIFIED'},meta:{source:'melisa-existing-erp-stock-read',catalogVersion:'existing-stock-v1',sourceDatabaseVerified:true,sourceDatabases:{products:'VEGA2026',images:'MELISA_ERP_V2'},stockFreshness:'unverified',cached:false,sourceUpdatedAt:null,capabilities:{read:true},fetchedAt:new Date(baseTime).toISOString()}});
const deferred=()=>{let resolve;const promise=new Promise(accept=>{resolve=accept;});return {promise,resolve};};
function setup({readProduct=async()=>envelope(),generate=async()=>response()}={}){
  let state,draft='Mevcut personel mesajı',clock=baseTime;const timers=new Set();
  const context={token:'synthetic-session',identity:'actor',epoch:1,uiEpoch:1,canSend:true,testOnly:true,conversation:{id:'55',phone:'+905387217733',owner:'Staff',assignedUserId:7,messages:[{id:'1',direction:'incoming',text:'Which product?'}]}};
  const flow=createSalesDraftFlow({getContext:()=>context,getDraft:()=>draft,generate,readProduct,onChange:next=>{state=next;},now:()=>clock,schedule:fn=>{timers.add(fn);return fn;},unschedule:fn=>timers.delete(fn)});
  return {flow,context,timers,get state(){return state;},get draft(){return draft;},set draft(value){draft=value;},advance(ms){clock+=ms;}};
}
test('three server-bound cards have exact recorded prices/currencies and honest source limits',()=>{
  const result=normalizeSalesProducts(response(),baseTime);assert.deepEqual(result.recommendedProducts,[product()]);assert.equal(result.catalogFacts.stockFreshness,'unverified');assert.equal(result.catalogFacts.seriesVerified,false);
  assert.deepEqual(normalizeSalesProducts({recommendedProducts:[],catalogFacts:null},baseTime),{recommendedProducts:[],catalogFacts:null});
  const decimal=product();decimal.salePrice=1.2345;assert.equal(normalizeSalesProducts({recommendedProducts:[decimal],catalogFacts:facts()},baseTime).recommendedProducts[0].salePrice,1.2345);
  for(const mutate of [p=>p.id='7',p=>p.salePrice=1.23456,p=>p.salePrice=Number.MAX_SAFE_INTEGER,p=>p.currency='GBP',p=>p.currency=null,p=>p.stockCode='x'.repeat(101),p=>p.productName='x'.repeat(201),p=>p.imageUrl='https://untrusted.test/image']){const r=response();mutate(r.recommendedProducts[0]);assert.throws(()=>normalizeSalesProducts(r,baseTime));}
  for(const mutate of [r=>r.recommendedProducts.push(product()),r=>r.catalogFacts.stockFreshness='verified',r=>r.catalogFacts.seriesVerified=true,r=>r.catalogFacts.expiresAt=new Date(baseTime+300001).toISOString(),r=>r.catalogFacts.expiresAt=new Date(baseTime).toISOString()]){const r=response();mutate(r);assert.throws(()=>normalizeSalesProducts(r,baseTime));}
});
test('fresh detail must match the selected code/name/recorded price/currency and guarded source',()=>{
  assert.deepEqual(assertSalesProductCurrent(envelope(),product(),baseTime),product());
  for(const mutate of [e=>e.data.stockCode='other',e=>e.data.productName='Edited name',e=>e.data.salePrice=197,e=>e.data.currency='USD',e=>e.data.photoStatus='unavailable',e=>e.data.photoPath='/crm/catalog/products/vega-99/photo',e=>e.meta.sourceDatabaseVerified=false,e=>e.meta.cached=true,e=>e.meta.sourceDatabases.products='OTHER',e=>e.data.pricedDocumentEligible=true]){const e=envelope();mutate(e);assert.throws(()=>assertSalesProductCurrent(e,product(),baseTime));}
  assert.throws(()=>assertSalesProductCurrent(envelope(),product(),baseTime+300001));
});
test('unknown/zero/unsupported/overprecision prices stay unpriced while product information remains usable',()=>{
  for(const [amount,currency,status] of [[0,'TRY','zero-unverified'],[-1,'TRY','invalid'],[null,'TRY','unknown'],[196,'GBP','recorded'],[1.23456,'TRY','recorded']]){
    const e=envelope();Object.assign(e.data,{salePrice:amount,currency,priceStatus:status});
    const unpriced={...product(),salePrice:null,currency:currency==='GBP'?null:currency};
    assert.deepEqual(assertSalesProductCurrent(e,unpriced,baseTime),unpriced);
    assert.equal(salesProductDraft(unpriced,'product'),'0007 · Gerçek kaynak ürünü');assert.throws(()=>salesProductDraft(unpriced,'price'));
  }
});
test('price and product helpers use the existing per-item text contract without a quote or conversion',()=>{
  assert.equal(salesProductDraft(product(),'product','Staff text'),'Staff text\n\n0007 · Gerçek kaynak ürünü');
  assert.equal(salesProductDraft(product(),'price'),'Kayıtlı satış fiyatları · adet fiyatı\n0007 · Gerçek kaynak ürünü · TRY 196');
  const usd={...product(),salePrice:1.2345,currency:'USD'};assert.match(salesProductDraft(usd,'price'),/USD 1\.2345$/);
  assert.throws(()=>salesProductDraft(product(),'order'));assert.throws(()=>salesProductDraft(product(),'price','x'.repeat(2000)));
});
test('product copy re-reads the selected real ID before returning a human draft and never overwrites it',async()=>{
  const calls=[];const h=setup({readProduct:async(token,id,options)=>{calls.push({token,id,options});return envelope();}});await h.flow.start();
  assert.equal(await h.flow.takeProductDraft('vega-7','price'),'Mevcut personel mesajı\n\nKayıtlı satış fiyatları · adet fiyatı\n0007 · Gerçek kaynak ürünü · TRY 196');
  assert.equal(calls.length,1);assert.equal(calls[0].id,'vega-7');assert.equal(calls[0].token,'synthetic-session');assert.ok(calls[0].options.signal instanceof AbortSignal);assert.equal(h.draft,'Mevcut personel mesajı');assert.equal(h.state.preview,null);assert.equal(h.timers.size,0);
  assert.equal(await h.flow.takeProductDraft('vega-7','price'),null);assert.equal(calls.length,1);
});
test('changed real price, currency, product metadata or auth closes the preview and preserves human text',async()=>{
  for(const edit of [e=>e.data.salePrice=200,e=>e.data.currency='EUR',e=>e.data.stockCode='new-code',e=>e.meta.cached=true]){
    const changed=envelope();edit(changed);const h=setup({readProduct:async()=>changed});await h.flow.start();assert.equal(await h.flow.takeProductDraft('vega-7','price'),null);assert.equal(h.state.preview,null);assert.equal(h.draft,'Mevcut personel mesajı');
  }
  const h=setup({readProduct:async()=>{throw Object.assign(Error('secret upstream detail'),{status:401});}});await h.flow.start();assert.equal(await h.flow.takeProductDraft('vega-7','product'),null);assert.equal(h.state.preview,null);assert.doesNotMatch(h.state.error,/secret/);
});
test('edited draft, new message, reassignment, session change or close during read discards late product results',async()=>{
  for(const edit of [h=>h.draft='New human text',h=>h.context.token='new-session',h=>h.context.conversation.assignedUserId=9,h=>h.context.conversation.messages.push({id:'2',direction:'incoming',text:'New request'}),h=>h.flow.close()]){
    const pending=deferred();const h=setup({readProduct:()=>pending.promise});await h.flow.start();const action=h.flow.takeProductDraft('vega-7','price');edit(h);h.flow.synchronize();pending.resolve(envelope());assert.equal(await action,null);assert.equal(h.state.preview,null);
  }
});
test('expired cards disable text/product copying even if the expiry timer has not fired',async()=>{
  const h=setup();await h.flow.start();assert.equal(h.timers.size,1);h.advance(300001);assert.equal(h.flow.isPreviewCurrent(),false);assert.equal(await h.flow.takeProductDraft('vega-7','price'),null);assert.equal(h.flow.takeDraft('unchanged'),null);assert.equal(h.state.preview,null);assert.equal(h.timers.size,0);
  const timer=setup();await timer.flow.start();[...timer.timers][0]();assert.equal(timer.state.preview,null);assert.match(timer.state.error,/süresi doldu/);
});
test('suggested photos use selected IDs, decode before publication and release URLs on close',async()=>{
  const photos=[],revoked=[],calls=[];
  const session=createSalesPhotoSession({products:[product()],fetchPhoto:async(id,options)=>{calls.push({id,options});return new Blob(['synthetic']);},isCurrent:()=>true,onPhoto:(id,photo)=>photos.push({id,photo}),onInvalidate:()=>assert.fail('unexpected auth'),urlApi:{createObjectURL:()=> 'blob:scoped-image',revokeObjectURL:url=>revoked.push(url)},decode:async url=>{assert.equal(url,'blob:scoped-image');assert.equal(photos.length,0);}});
  await session.read();assert.equal(calls[0].id,'vega-7');assert.ok(calls[0].options.signal instanceof AbortSignal);assert.equal(photos[0].photo.url,'blob:scoped-image');session.close();assert.deepEqual(revoked,['blob:scoped-image']);
});
test('close/current-context loss or photo auth denial blocks late images and aborts active reads',async()=>{
  const pending=deferred(),photos=[],revoked=[];let signal;
  const session=createSalesPhotoSession({products:[product()],fetchPhoto:async(_id,options)=>{signal=options.signal;return pending.promise;},isCurrent:()=>true,onPhoto:(...args)=>photos.push(args),onInvalidate:()=>assert.fail('unexpected auth'),urlApi:{createObjectURL:()=> 'blob:late',revokeObjectURL:url=>revoked.push(url)},decode:async()=>{}});
  const read=session.read();session.close();assert.equal(signal.aborted,true);pending.resolve(new Blob(['synthetic']));await read;assert.equal(photos.length,0);
  let invalidated=0;const denied=createSalesPhotoSession({products:[product()],fetchPhoto:async()=>{throw Object.assign(Error('private error'),{status:403});},isCurrent:()=>true,onPhoto:()=>assert.fail('denied image'),onInvalidate:error=>{assert.equal(error.status,403);invalidated++;},decode:async()=>{}});await denied.read();assert.equal(invalidated,1);
  const decoding=deferred();let valid=true;const decodedUrls=[];const stale=createSalesPhotoSession({products:[product()],fetchPhoto:async()=>new Blob(['synthetic']),isCurrent:()=>valid,onPhoto:()=>assert.fail('stale decode'),onInvalidate:()=>{},urlApi:{createObjectURL:()=> 'blob:stale',revokeObjectURL:url=>decodedUrls.push(url)},decode:()=>decoding.promise});const late=stale.read();await new Promise(resolve=>setImmediate(resolve));valid=false;decoding.resolve();await late;assert.deepEqual(decodedUrls,['blob:stale']);
});
test('actual suggestion markup shows guarded photo status, recorded price/ISO currency and separate human actions',async()=>{
  const {buildSync}=await import('esbuild'),{pathToFileURL,fileURLToPath}=await import('node:url'),{mkdirSync,rmSync}=await import('node:fs');
  const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
  const root=fileURLToPath(new URL('../',import.meta.url)),dir=fileURLToPath(new URL('../.sites-runtime/',import.meta.url));mkdirSync(dir,{recursive:true});const file=dir+'sales-products-ui-test.mjs';
  try{
    buildSync({absWorkingDir:root,tsconfigRaw:{},entryPoints:[root+'src/SalesSuggestion.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
    const Suggestion=(await import(pathToFileURL(file).href)).default;
    const props={state:{busy:false,preview:{...response(),recommendedProducts:[product(),{...product(),id:'vega-8',salePrice:null,photoEligible:false}]},error:''},allowed:true,token:'synthetic',isCurrent:()=>true,onInvalidate(){},onRequest(){},onTakeDraft(){},onTakeProduct(){},onClose(){}};
    const html=renderToStaticMarkup(React.createElement(Suggestion,props));assert.match(html,/TRY 196 \/ adet/);assert.match(html,/Fiyat doğrulanamadı/);assert.match(html,/Fotoğraf yükleniyor/);assert.match(html,/Fotoğraf yok/);assert.match(html,/Ürün bilgisini taslağa al/);assert.match(html,/Fiyatı taslağa al/);assert.match(html,/Güncel stok ve seri bilgisi doğrulanmış değildir/);assert.match(html,/Ürün veya kod \(isteğe bağlı\)/);assert.doesNotMatch(html,/stockQty|CRM_AI|API_KEY|https:\/\/untrusted/);
    const denied=renderToStaticMarkup(React.createElement(Suggestion,{...props,allowed:false}));assert.match(denied,/disabled=""/);
  }finally{rmSync(file,{force:true});}
});
test('optional search is the only added POST field; detail is an authenticated read, not a facts submission',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json(url.includes('sales-draft')?{success:true,data:response()}:envelope());});
  await liveApi.salesDraft('synthetic-session','55',{catalogSearch:' 0007 ',prices:[9],stock:999});assert.deepEqual(JSON.parse(calls[0].options.body),{catalogSearch:'0007'});
  const detail=await liveApi.existingCatalogProduct('synthetic-session','vega-7',{signal:new AbortController().signal});assert.equal(detail.success,true);assert.equal(calls[1].url,'/api/live/crm/catalog/products/vega-7');assert.equal(calls[1].options.method,undefined);assert.equal(calls[1].options.body,undefined);assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-session');
  assert.throws(()=>liveApi.existingCatalogProduct('synthetic-session','7'));assert.throws(()=>liveApi.salesDraft('synthetic-session','55',{catalogSearch:'x'.repeat(121)}));assert.equal(calls.length,2);
});
