import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {amountToMinor,createSalesRulesEditor,formToPolicy,minimumLabel,normalizeSalesPolicyFacts,normalizeSalesRules,policyToForm,salesRulesFailureMessage} from '../src/lib/salesRules.js';
import {createSalesDraftFlow} from '../src/lib/salesDraft.js';
import {liveApi} from '../src/liveApi.js';

const blank=()=>({version:'unconfigured-v1',minimumOrderMode:'unconfigured',minimumOrder:null,telegramUrl:null,countryRules:[],shippingTerms:'',salesNotes:''});
const record=(overrides={})=>({policy:blank(),revision:'a'.repeat(64),configured:true,writable:true,...overrides});
const facts=(overrides={})=>({...blank(),revision:'a'.repeat(64),requiresStaffConfirmation:true,countrySelection:'unverified',shippingConfirmation:'staff',discountAllowed:false,breakSeries:false,autoSend:false,writeErp:false,...overrides});
const deferred=()=>{let resolve;const promise=new Promise(accept=>resolve=accept);return{promise,resolve};};
function editorHarness({read=async()=>record(),write=async()=>record({revision:'b'.repeat(64)})}={}){
  let context={token:'synthetic',identity:'actor',epoch:1,role:'patron'},state;
  const editor=createSalesRulesEditor({getContext:()=>context,read,write,onChange:next=>state=next});
  return{editor,get state(){return state;},context};
}
test('unconfigured policy stays blank and money is parsed exactly without defaults or silent rounding',()=>{
  const value=normalizeSalesRules(record()),form=policyToForm(value.policy);
  assert.equal(form.amount,'');assert.equal(form.currency,'');assert.equal(form.minimumOrderMode,'unconfigured');assert.deepEqual(formToPolicy(form),blank());
  assert.equal(amountToMinor('1234,56'),123456);assert.equal(amountToMinor('0.01'),1);assert.equal(amountToMinor('10000000'),1_000_000_000);
  for(const bad of ['0','-1','1.234','1e3','1,000.00','10000000.01',''])assert.throws(()=>amountToMinor(bad));
  assert.equal(minimumLabel(blank()),'Minimum sipariş henüz belirlenmedi');assert.equal(minimumLabel({...blank(),minimumOrderMode:'none'}),'Minimum sipariş tutarı yok');
});
test('country rules use owner names and modes, preserve notes and reject duplicate countries',()=>{
  const form=policyToForm(blank());form.countryRules=[{country:'Türkiye',minimumOrderMode:'none',amount:'',currency:'',notes:'Kargo ayrıca görüşülür.'},{country:'Almanya',minimumOrderMode:'amount',amount:'500,50',currency:'EUR',notes:''}];
  assert.equal(formToPolicy(form).countryRules[1].minimumOrder.amountMinor,50050);
  assert.equal(formToPolicy(form).countryRules[0].country,'Türkiye');
  form.countryRules.push({...form.countryRules[0],country:'türkiye'});assert.throws(()=>formToPolicy(form));
});
test('policy facts are bounded server review data and cannot relax execution rules',()=>{
  assert.equal(normalizeSalesPolicyFacts(facts()).revision,'a'.repeat(64));
  for(const change of [{revision:'bad'},{minimumOrderMode:'amount',minimumOrder:null},{autoSend:true},{countrySelection:'TR'},{requiresStaffConfirmation:'yes'},{shippingTerms:'x'.repeat(2001)}])assert.throws(()=>normalizeSalesPolicyFacts(facts(change)));
});
test('all roles may read rules but only patron with server writable flag can edit or save',async()=>{
  let reads=0,writes=0;for(const role of ['patron','mudur','personel']){
    const h=editorHarness({read:async()=>{reads++;return record({writable:role==='patron'});},write:async()=>{writes++;return record();}});h.context.role=role;
    assert.equal(await h.editor.load(),true);
    assert.equal(h.editor.edit({...h.state.form,salesNotes:'Yeni koşul'}),role==='patron');assert.equal(await h.editor.save(),role==='patron');
  }assert.equal(reads,3);assert.equal(writes,1);
  const blocked=editorHarness({read:async()=>record({writable:false})});await blocked.editor.load();assert.equal(blocked.editor.edit({...blocked.state.form,salesNotes:'deny'}),false);assert.equal(await blocked.editor.save(),false);
});
test('optimistic save sends original revision, stores server version, and never overwrites edited form on conflict/auth failure',async()=>{
  for(const status of [401,403,409,503]){
    let payload;const h=editorHarness({write:async(_token,value)=>{payload=value;throw{status,message:'secret raw path'};}});await h.editor.load();h.editor.edit({...h.state.form,salesNotes:'Personelin düzenlediği koşul'});
    assert.equal(await h.editor.save(),false);assert.equal(payload.revision,'a'.repeat(64));assert.equal(h.state.form.salesNotes,'Personelin düzenlediği koşul');assert.equal(h.state.dirty,true);assert.equal(h.state.busy,false);assert.ok(h.state.error);assert.doesNotMatch(h.state.error,/secret|raw|path/);
  }
  const h=editorHarness({write:async()=>record({policy:{...blank(),version:'server-next',salesNotes:'Yeni koşul'},revision:'b'.repeat(64)})});await h.editor.load();h.editor.edit({...h.state.form,salesNotes:'Yeni koşul'});assert.equal(await h.editor.save(),true);assert.equal(h.state.form.version,'server-next');assert.equal(h.state.record.revision,'b'.repeat(64));assert.equal(h.state.dirty,false);
});
test('editor cancellation, account replacement and role change reject late replies without changing human data',async()=>{
  for(const mutate of [h=>h.editor.close(),h=>{h.context.identity='another';},h=>{h.context.token='replacement';},h=>{h.context.epoch++;},h=>{h.context.role='personel';}]){
    const pending=deferred();let signal;const h=editorHarness({write:async(_token,_body,options)=>{signal=options.signal;return pending.promise;}});await h.editor.load();h.editor.edit({...h.state.form,salesNotes:'İnsan metni'});
    const saving=h.editor.save();assert.equal(await h.editor.save(),false);mutate(h);pending.resolve(record({policy:{...blank(),salesNotes:'late overwrite'}}));assert.equal(await saving,false);assert.equal(h.state.form.salesNotes,'İnsan metni');if(signal.aborted)assert.equal(h.state.dirty,true);
  }
});
test('incidental reload preserves edits, explicit reload discards them with the new revision',async()=>{
  let calls=0;const h=editorHarness({read:async()=>++calls===1?record():record({revision:'b'.repeat(64),policy:{...blank(),salesNotes:'Server condition'}})});
  await h.editor.load();h.editor.edit({...h.state.form,salesNotes:'Local edit'});h.context.token='new-token';await h.editor.load();assert.equal(h.state.form.salesNotes,'Local edit');assert.equal(h.state.record.revision,'a'.repeat(64));
  await h.editor.load({replace:true});assert.equal(h.state.form.salesNotes,'Server condition');assert.equal(h.state.record.revision,'b'.repeat(64));assert.equal(h.state.dirty,false);
});

const response=()=>({action:'reply',reply:'Reviewed response',summaryTr:'Türkçe özet',conversationId:'55',conversationRevision:'a'.repeat(64),generatedAt:'2026-10-04T18:00:00Z',mode:'copilot',requiresHumanReview:true,autoSend:false,erpWrite:false,policyFacts:facts()});
function suggestionHarness(readPolicy=async()=>record(),extra={}){
  let draft='Human composer',state;const context={token:'synthetic',identity:'actor',epoch:1,uiEpoch:1,canSend:true,testOnly:true,conversation:{id:'55',phone:'+905387217733',messages:[{id:'1',direction:'incoming',text:'Hello'}]}};
  const flow=createSalesDraftFlow({getContext:()=>context,getDraft:()=>draft,generate:async()=>response(),readPolicy,onChange:next=>state=next,...extra});
  return{flow,context,get state(){return state;},get draft(){return draft;},set draft(value){draft=value;}};
}
test('text take re-reads common policy revision and appends only after unchanged rules are verified',async()=>{
  let reads=0;const h=suggestionHarness(async()=>{reads++;return record();});await h.flow.start();assert.equal(await h.flow.takeDraft(h.draft),'Human composer\n\nReviewed response');assert.equal(reads,1);assert.equal(h.state.preview,null);
  const changed=suggestionHarness(async()=>record({revision:'b'.repeat(64)}));await changed.flow.start();assert.equal(await changed.flow.takeDraft(changed.draft),null);assert.match(changed.state.error,/kuralları değişti/);assert.equal(changed.draft,'Human composer');assert.equal(changed.state.preview,null);
});
test('draft edits, session/thread/assignment changes and cancellation during policy read cannot take a suggestion',async()=>{
  const mutations=[h=>{h.draft='New human edit';},h=>{h.context.token='other';},h=>{h.context.identity='other';},h=>{h.context.canSend=false;},h=>{h.context.conversation.id='56';},h=>{h.context.conversation.ownerId=2;},h=>{h.context.conversation.messages.push({id:'2',text:'new'});},h=>h.flow.close()];
  for(const mutate of mutations){const pending=deferred();const h=suggestionHarness(()=>pending.promise);await h.flow.start();const taking=h.flow.takeDraft(h.draft);assert.equal(await h.flow.takeDraft(h.draft),null);mutate(h);pending.resolve(record());assert.equal(await taking,null);assert.ok(h.draft.includes('human')||h.draft==='Human composer');assert.equal(h.state.preview,null);}
});
test('production flow rejects missing policy facts before publishing a preview; read failures preserve the composer',async()=>{
  const h=suggestionHarness(async()=>record(),{generate:async()=>{const value=response();delete value.policyFacts;return value;}});assert.equal(await h.flow.start(),false);assert.equal(h.state.preview,null);
  for(const status of [401,403,409,503]){const failing=suggestionHarness(async()=>{throw{status,message:'raw secret'};});await failing.flow.start();assert.equal(await failing.flow.takeDraft(failing.draft),null);assert.equal(failing.draft,'Human composer');assert.equal(failing.state.preview,null);assert.doesNotMatch(failing.state.error,/raw secret/);}
});
test('both product and price take verify product details then current policy, never taking on a changed policy',async()=>{
  const now=Date.parse('2026-10-04T18:00:00Z');
  const product={id:'vega-7',stockCode:'0007',productName:'Kaynak ürünü',salePrice:196,currency:'TRY',priceBasis:'per-item',photoEligible:false};
  const productEnvelope={success:true,data:{...product,photoStatus:'unavailable',photoPath:null,priceStatus:'recorded',priceBasisStatus:'user-confirmed',sourceUpdatedAt:null,pricedDocumentEligible:false,pricedDocumentBlockReason:'SOURCE_FRESHNESS_UNVERIFIED'},meta:{source:'melisa-existing-erp-stock-read',catalogVersion:'existing-stock-v1',sourceDatabaseVerified:true,sourceDatabases:{products:'VEGA2026',images:'MELISA_ERP_V2'},stockFreshness:'unverified',cached:false,sourceUpdatedAt:null,capabilities:{read:true},fetchedAt:new Date(now).toISOString()}};
  const catalogFacts={source:'melisa-existing-erp-stock-read',catalogVersion:'existing-stock-v1',fetchedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),sourceDatabaseVerified:true,stockFreshness:'unverified',seriesVerified:false};
  for(const action of ['product','price'])for(const changed of [false,true]){
    const calls=[];const h=suggestionHarness(async()=>{calls.push('rules');return record({revision:(changed?'b':'a').repeat(64)});},{generate:async()=>({...response(),recommendedProducts:[product],catalogFacts}),readProduct:async()=>{calls.push('product');return productEnvelope;},now:()=>now});
    await h.flow.start();const taken=await h.flow.takeProductDraft(product.id,action);assert.deepEqual(calls,['product','rules']);assert.equal(taken===null,changed);assert.equal(h.draft,'Human composer');if(!changed)assert.match(taken,/0007 · Kaynak ürünü/);assert.equal(h.state.preview,null);
  }
});
test('rules API routes GET/PUT only with typed policy, revision and cancellation, no send or ERP fields',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:record()});});
  const controller=new AbortController();await liveApi.salesRules('synthetic',{signal:controller.signal});await liveApi.saveSalesRules('synthetic',{policy:blank(),revision:'a'.repeat(64),autoSend:true,erpWrite:true},{signal:controller.signal});
  assert.equal(calls[0].url,'/api/live/crm/sales-rules');assert.equal(calls[1].options.method,'PUT');assert.deepEqual(JSON.parse(calls[1].options.body),{policy:blank(),revision:'a'.repeat(64)});assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic');assert.equal(calls[1].options.redirect,'error');assert.ok(calls[1].options.signal instanceof AbortSignal);
});
test('rules API cancellation aborts its single request without replaying an optimistic save',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));});
  const controller=new AbortController(),saving=liveApi.saveSalesRules('synthetic',{policy:blank(),revision:'a'.repeat(64)},{signal:controller.signal});controller.abort();await assert.rejects(saving,{name:'AbortError'});assert.equal(calls,1);
});
test('Settings integration mounts the account-bound editor and does not write the chat composer',async()=>{
  const component=await readFile(new URL('../src/SalesRulesSettings.jsx',import.meta.url),'utf8');const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(component,/setDraft|\.send\(|erpDraft/);assert.match(app,/SalesRulesSettings key=\{getSalesRulesContext\(\)\.identity\}/);assert.match(app,/const nextDraft = await salesDraftFlowRef\.current\.takeDraft\(existingDraft\)/);assert.match(app,/draftRef\.current!==existingDraft/);
});
