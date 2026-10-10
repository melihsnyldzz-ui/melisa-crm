import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesDraftFlow} from '../src/lib/salesDraft.js';
import {normalizePersonalCatalogSnapshot} from '../src/lib/salesProducts.js';
import {liveApi} from '../src/liveApi.js';
import {listCustomerCatalogSessions,readCustomerCatalogSalesContext} from '../src/customerCatalog/api.js';

const sessionId='aaaaaaaa-1111-4111-8111-111111111111',clock=Date.parse('2026-10-10T18:00:00Z');
const card={id:'erp-1',stockCode:'TEST-A',productName:'TEST seri A',testOnly:true,recommended:true,selectable:true,currency:'TRY',unitPrice:109.25,unitPriceExact:'109.25000000',seriesTotalExact:'655.50000000',photoPath:'/api/customer-catalog/products/erp-1/photo',availability:'available',maxSeries:5,series:{verified:true,isTestExample:true,totalPieces:6,composition:[{label:'3 ay',quantity:2},{label:'9 ay',quantity:2},{label:'12 ay',quantity:2}]}};
const snapshot=()=>({sessionId,conversationId:'55',customerId:593,actorId:"1",revision:0,configRevision:'c'.repeat(64),sourceFingerprint:'b'.repeat(64),fingerprint:'a'.repeat(64),expiresAt:new Date(clock+3600000).toISOString(),fetchedAt:new Date(clock).toISOString(),source:'melisa-personal-test-catalog',sourceEnvironment:'CANONICAL_TEST',sourceDatabaseVerified:true,readOnly:true,testOnly:true,orderPending:false,products:[structuredClone(card)],cart:{revision:0,items:[],modelCount:0,seriesCount:0,pieceCount:0,productTotalExact:'0.00000000',currency:'TRY',valid:true}});
const metadata=s=>Object.fromEntries(['sessionId','revision','fingerprint','sourceFingerprint','expiresAt','conversationId','customerId'].map(key=>[key,s[key]]));
const reply=()=>({action:'recommend',reply:'TEST ürünü inceleyebilirsiniz.',summaryTr:'Kişisel katalog önerisi.',conversationId:'55',conversationRevision:'f'.repeat(64),generatedAt:new Date(clock).toISOString(),mode:'copilot',requiresHumanReview:true,autoSend:false,erpWrite:false,personalCatalog:metadata(snapshot()),recommendedProducts:[{...structuredClone(card),salePrice:card.unitPrice,priceExact:card.unitPriceExact,priceBasis:'per-item',photoEligible:true}]});
function setup({generate=async()=>reply(),readPolicy}={}){
  let state,current=snapshot(),draft='Mevcut metin',reads=0,generalReads=0,options;
  const context={token:'synthetic-staff',identity:'actor',epoch:1,uiEpoch:1,canSend:true,conversation:{id:'55',messages:[]},customerCatalogSessionId:sessionId};
  const flow=createSalesDraftFlow({getContext:()=>context,getDraft:()=>draft,generate:async(...args)=>{options=args[2];return generate(...args);},readPersonalCatalog:async()=>{reads++;return structuredClone(current);},readProduct:async()=>{generalReads++;throw Error('General catalog forbidden');},readPolicy,onChange:value=>state=value,now:()=>clock,schedule:()=>null,unschedule:()=>{}});
  return {flow,context,get state(){return state;},get options(){return options;},get reads(){return reads;},get generalReads(){return generalReads;},get snapshot(){return current;},set snapshot(value){current=value;},get draft(){return draft;}};
}
test('explicit session only forwards ID and trusted cards preserve exact unit price and TEST6 composition',async()=>{
  const h=setup();assert.equal(await h.flow.start(),true);assert.equal(h.options.customerCatalogSessionId,sessionId);assert.equal(h.options.draftContext,undefined);
  assert.equal(h.state.preview.recommendedProducts[0].priceExact,'109.25000000');assert.equal(h.state.preview.recommendedProducts[0].series.totalPieces,6);
  assert.equal(h.state.preview.recommendedProducts[0].photoEligible,false);assert.equal(h.state.preview.personalCart.modelCount,0);
  assert.match(await h.flow.takeProductDraft('erp-1','price'),/655\.50000000/);assert.equal(h.generalReads,0);assert.equal(h.reads,2);
});
test('scope, model price or series mismatch never enters the preview and personal mode cannot fall back',async()=>{
  for(const change of [r=>r.recommendedProducts[0].id='erp-99',r=>r.recommendedProducts[0].salePrice=1,r=>r.recommendedProducts[0].series.totalPieces=4,r=>delete r.personalCatalog]){
    const h=setup({generate:async()=>{const r=reply();change(r);return r;}});assert.equal(await h.flow.start(),false);assert.equal(h.state.preview,null);assert.equal(h.generalReads,0);
  }
});
test('cart revision, source, expiry, session or assignment changes block copying and preserve composer',async()=>{
  for(const mutate of [h=>{h.snapshot.revision++;h.snapshot.cart.revision++;h.snapshot.fingerprint='d'.repeat(64);},h=>h.snapshot.sourceFingerprint='d'.repeat(64),h=>h.snapshot.expiresAt=new Date(clock-1).toISOString(),h=>h.context.customerCatalogSessionId='bbbbbbbb-1111-4111-8111-111111111111',h=>h.context.conversation.assignedUserId=2]){
    for(const action of ['text','product']){const h=setup();await h.flow.start();mutate(h);assert.equal(action==='text'?await h.flow.takeDraft(h.draft):await h.flow.takeProductDraft('erp-1','price'),null);assert.equal(h.draft,'Mevcut metin');assert.equal(h.generalReads,0);}
  }
});
test('cart recheck runs after delayed policy validation for text and product copying',async()=>{
  const policy={version:'unconfigured-v1',minimumOrderMode:'unconfigured',minimumOrder:null,telegramUrl:null,countryRules:[],shippingTerms:'',salesNotes:''};
  for(const action of ['text','product']){
    let resolve;const pending=new Promise(accept=>resolve=accept);
    const h=setup({readPolicy:()=>pending,generate:async()=>({...reply(),policyFacts:{...policy,revision:'e'.repeat(64),requiresStaffConfirmation:true,countrySelection:'unverified',shippingConfirmation:'staff',discountAllowed:false,breakSeries:false,autoSend:false,writeErp:false}})});
    await h.flow.start();const copying=action==='text'?h.flow.takeDraft(h.draft):h.flow.takeProductDraft('erp-1','price');
    h.snapshot.fingerprint='d'.repeat(64);resolve({policy,revision:'e'.repeat(64),configured:true,writable:true});
    assert.equal(await copying,null);assert.equal(h.draft,'Mevcut metin');assert.equal(h.generalReads,0);
  }
});
test('pending or malformed personal source never permits a model call',async()=>{
  const s=snapshot();s.orderPending=true;assert.throws(()=>normalizePersonalCatalogSnapshot(s,'55',sessionId,clock));
  const h=setup();h.snapshot=s;assert.equal(await h.flow.start(),false);assert.equal(h.options,undefined);
});
test('staff listing/context is authenticated read-only; sales POST rejects arbitrary body products or prices',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:url.includes('sales-draft')?reply():url.includes('sales-context')?snapshot():{conversationId:'55',testOnly:true,sessions:[{sessionId,revision:0,expiresAt:snapshot().expiresAt,itemCount:0,orderPending:false}]}});});
  await listCustomerCatalogSessions('synthetic-staff','55');await readCustomerCatalogSalesContext('synthetic-staff',sessionId);
  await liveApi.salesDraft('synthetic-staff','55',{customerCatalogSessionId:sessionId,products:[{id:'erp-99'}],price:1,draftContext:{items:[{quantity:999}]}});
  assert.equal(calls[0].url,'/api/live/crm/customer-catalog/sessions?conversationId=55');assert.equal(calls[1].url,`/api/live/crm/customer-catalog/sessions/${sessionId}/sales-context`);
  for(const call of calls.slice(0,2)){assert.equal(call.options.method,undefined);assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');assert.equal(call.options.headers.Authorization,'Bearer synthetic-staff');}
  assert.deepEqual(JSON.parse(calls[2].options.body),{aiIntent:{userInitiated:true,action:'manual'},customerCatalogSessionId:sessionId});
  await assert.rejects(async()=>liveApi.salesDraft('synthetic-staff','55',{customerCatalogSessionId:'../bad'}));assert.equal(calls.length,3);
});
