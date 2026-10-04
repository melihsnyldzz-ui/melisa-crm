import assert from 'node:assert/strict';
import test from 'node:test';
import {createSalesDraftFlow, salesDraftContextKey, salesDraftFailureMessage, validateSalesDraft} from '../src/lib/salesDraft.js';
import {liveApi, normalizeConversation} from '../src/liveApi.js';

const response = () => ({action:'reply',reply:'How can I help with your order?',summaryTr:'Müşteri için yanıt önerisi.',conversationId:'55',conversationRevision:'a'.repeat(64),generatedAt:'2026-10-04T18:00:00Z',mode:'copilot',requiresHumanReview:true,autoSend:false,erpWrite:false});
const context = () => ({token:'synthetic-session',identity:'actor-a',epoch:1,uiEpoch:1,canSend:true,blocked:false,testOnly:true,conversation:{id:'55',phone:'+90 538 721 77 33',owner:'Personel A',assignedUserId:7,status:'open',messages:[{id:'incoming-1',direction:'incoming',text:'Hello',createdAt:'2026-10-04T18:00:00Z'}]}});
function harness(generate=async()=>response()) {
  let current=context(),state; const flow=createSalesDraftFlow({getContext:()=>current,generate,onChange:next=>{state=next;}});
  return {flow,get current(){return current;},set current(value){current=value;},get state(){return state;}};
}
const deferred = () => {let resolve; const promise=new Promise(accept=>{resolve=accept;});return {promise,resolve};};

test('review is explicit and copying appends to an edited staff draft without sending', async () => {
  const h=harness(); assert.equal(await h.flow.start(),true);
  assert.equal(h.state.preview.summaryTr,response().summaryTr);
  assert.equal(h.flow.takeDraft('Personelin düzenlediği mesaj'),'Personelin düzenlediği mesaj\n\n'+response().reply);
  assert.equal(h.state.preview,null);
  assert.equal(h.flow.takeDraft('second click'),null);
});
test('one busy request owns the preview and close aborts without allowing its late response', async () => {
  const pending=deferred(); let calls=0,signal;
  const h=harness(async(_token,_id,options)=>{calls++;signal=options.signal;return pending.promise;});
  const first=h.flow.start(); assert.equal(h.state.busy,true);assert.equal(await h.flow.start(),false);assert.equal(calls,1);
  h.flow.close();assert.equal(signal.aborted,true);pending.resolve(response());assert.equal(await first,false);assert.equal(h.state.preview,null);
});
test('session, recipient, assignment, incoming edits and new messages invalidate both pending and reviewed suggestions', async () => {
  const mutations=[
    c=>{c.token='replacement-session';},c=>{c.identity='actor-b';},c=>{c.epoch++;},c=>{c.uiEpoch++;},c=>{c.canSend=false;},c=>{c.blocked=true;},
    c=>{c.conversation.id='56';},c=>{c.conversation.phone='+905551111111';},c=>{c.conversation.assignedUserId=8;},c=>{c.conversation.assignedPersonnelId='staff-b';},
    c=>{c.conversation.owner='Other staff';},c=>{c.conversation.assignedUserName='Other agent';},
    c=>{c.conversation.chatwootAgentId=4;},c=>{c.conversation.status='resolved';},c=>{c.conversation.messages[0].text='Edited same message';},
    c=>{c.conversation.messages.push({id:'new-incoming',direction:'incoming',text:'New request'});},
    c=>{c.conversation.messages[0].attachments=[{id:'image',type:'image',url:'https://example.test/image'}];},
  ];
  for(const mutate of mutations) {
    const pending=deferred();const h=harness(()=>pending.promise); const first=h.flow.start();mutate(h.current);h.flow.synchronize();pending.resolve(response());
    assert.equal(await first,false);assert.equal(h.state.preview,null);
    const ready=harness();assert.equal(await ready.flow.start(),true);mutate(ready.current);assert.equal(ready.flow.takeDraft('existing text'),null);assert.equal(ready.state.preview,null);
  }
});
test('old cancelled work cannot remove or replace a new conversation suggestion', async () => {
  const old=deferred();let calls=0;const h=harness(()=>++calls===1?old.promise:Promise.resolve(response()));
  const first=h.flow.start();h.current.uiEpoch++;h.flow.synchronize();assert.equal(await h.flow.start(),true);
  old.resolve({...response(),reply:'old answer'});assert.equal(await first,false);assert.equal(h.state.preview.reply,response().reply);
});

test('normalized unmapped Chatwoot agents with the same display name invalidate a reviewed suggestion', async () => {
  const h=harness();
  const raw={id:'55',phone:'+905387217733',name:'TEST',assignedUserId:null,assignedUserName:'Same agent name',chatwootAgentId:3,
    messages:[{id:'incoming-1',direction:'incoming',text:'Hello'}]};
  h.current.conversation=normalizeConversation(raw);
  assert.equal(await h.flow.start(),true);
  h.current.conversation=normalizeConversation({...raw,chatwootAgentId:4});
  assert.equal(h.flow.takeDraft('Existing staff text'),null);
  assert.equal(h.state.preview,null);
});
test('permission or TEST recipient denial happens before any model request', async () => {
  let calls=0;for(const mutate of [c=>{c.canSend=false;},c=>{c.token='';},c=>{c.identity='';},c=>{c.conversation.id='56';},c=>{c.conversation.phone='unavailable';}]) {
    const h=harness(async()=>{calls++;return response();});mutate(h.current);assert.equal(salesDraftContextKey(h.current),'');assert.equal(await h.flow.start(),false);
  } assert.equal(calls,0);
});
test('server response must declare human review and zero writes for the selected conversation', async () => {
  for(const invalid of [{autoSend:true},{erpWrite:true},{requiresHumanReview:false},{conversationId:'56'},{conversationRevision:''},{reply:''},{summaryTr:''},{mode:'autonomous'},{generatedAt:'invalid'}]) {
    assert.throws(()=>validateSalesDraft({...response(),...invalid},'55'));
    const h=harness(async()=>({...response(),...invalid}));assert.equal(await h.flow.start(),false);assert.equal(h.state.preview,null);assert.match(h.state.error,/doğrulanamadı/);
  }
});
test('long existing text is retained, and the reviewed suggestion remains available to copy after shortening', async () => {
  const h=harness();await h.flow.start();assert.equal(h.flow.takeDraft('x'.repeat(2000)),null);assert.ok(h.state.preview);assert.match(h.state.error,/2000/);
  assert.equal(h.flow.takeDraft('Short'),`Short\n\n${response().reply}`);
  const long=harness(async()=>({...response(),reply:'x'.repeat(3000)}));assert.equal(await long.flow.start(),true);assert.equal(long.flow.takeDraft(''),null);assert.equal(long.state.preview.reply.length,3000);
});
test('failure labels never expose upstream errors, model contents, credentials or debug codes', async () => {
  for(const error of [{status:503,code:'AI_SALES_DISABLED'},{status:401},{status:403},{status:409},{status:429},{status:502,code:'UPSTREAM_KEY_SECRET'},{code:'CRM_REQUEST_TIMEOUT'}]) {
    const value={...error,message:'private raw credential and model text'};const label=salesDraftFailureMessage(value);
    assert.doesNotMatch(label,/private|credential|UPSTREAM|AI_SALES_DISABLED|CRM_REQUEST_TIMEOUT/);
    const h=harness(async()=>{throw value;});await h.flow.start();assert.equal(h.state.error,label);
  }
});
test('sales API sends only an empty body and existing auth to the selected read-only endpoint', async t => {
  let call;t.mock.method(globalThis,'fetch',async(url,options)=>{call={url,options};return Response.json({success:true,data:response()});});
  const controller=new AbortController();const result=await liveApi.salesDraft('synthetic-session','55',{signal:controller.signal,history:['must not be sent'],price:1});
  assert.equal(result.reply,response().reply);assert.equal(call.url,'/api/live/crm/conversations/55/sales-draft');assert.equal(call.options.method,'POST');
  assert.equal(call.options.headers.Authorization,'Bearer synthetic-session');assert.deepEqual(JSON.parse(call.options.body),{});assert.equal(call.options.redirect,'error');
  assert.ok(call.options.signal instanceof AbortSignal);
});
test('sales API forwards cancellation without retrying the model request', async t => {
  let calls=0;t.mock.method(globalThis,'fetch',async(_url,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));});
  const controller=new AbortController();const pending=liveApi.salesDraft('synthetic-session','55',{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
