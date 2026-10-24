import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationMessageController} from './conversationController.js';
import {sendCrmTextMessage} from '../services/sendService.js';
import {createMemoryOutboundAttemptStore} from '../services/outboundAttemptService.js';
import {env} from '../config/env.js';
import {WAAPI_RECIPIENT} from '../providers/waapiProvider.js';

function fixture(t, change = () => {}) {
  const original = {...env.whatsapp}; t.after(() => Object.assign(env.whatsapp, original));
  Object.assign(env.whatsapp, {provider:'waapi',sendEnabled:true,liveSendApproved:true,testNumberOnly:true,allowedTestNumbers:[WAAPI_RECIPIENT]});
  const initial = {id:'normal-fixture',username:'normal-fixture',role:'personel',active:true,chatwootAgentId:2,permissions:['crm.view','crm.send']};
  const state = {user:{...initial},allowed:true,expiresAt:Date.now()+60000,revoked:false,sends:0,afterSend:()=>{},proof:true};
  const attemptStore = createMemoryOutboundAttemptStore(); attemptStore.reset();
  const deps = {attemptStore,provider:{sendMessage:async()=>{state.sends++;state.afterSend();return {provider:'waapi',providerMessageId:'normal-guard-fixture',text:'fixture'};}},
    bridge:{assertSafe:async()=>{},resolveConversation:async()=>{change(state);},sync:async()=>{}},
    journal:{accept:async()=>{}},verifyDeliveryProof:async()=>({confirmed:state.proof,chatwootMessageId:'fixture-message'})};
  const controller = createConversationMessageController({
    verify:(_token,options)=>{assert.equal(options?.includeContext,true);if(state.revoked)throw Object.assign(Error('revoked'),{code:'AUTH_TOKEN_INVALID',statusCode:401});return {user:state.user,expiresAt:state.expiresAt};},
    readConversation:async()=>({id:55,phone:WAAPI_RECIPIENT,remoteJid:'',contactName:'Fixture'}),
    readAccess:async()=>{if(!state.allowed)throw Object.assign(Error('reassigned'),{code:'WHATSAPP_CRM_CONVERSATION_FORBIDDEN',statusCode:403});},
    sendMessage:(payload,options)=>sendCrmTextMessage(payload,{...deps,...options}),
  });
  const req={user:initial,get:()=> 'Bearer synthetic-normal',params:{conversationId:'55'},body:{text:'fixture',clientRequestId:'NORMAL-GUARD-REQUEST-001'}};
  const call=async()=>{let error,result,status;await controller(req,{status:value=>{status=value;return {json:value=>{result=value;}};}},value=>{error=value;});return {error,result,status};};
  return {state,call,attemptStore,req};
}

test('normal controller blocks reassignment during bridge wait before transport',async t=>{
  const f=fixture(t,state=>{state.allowed=false;});
  const result=await f.call();
  assert.equal(result.error?.statusCode,403);assert.equal(f.state.sends,0);
  assert.equal((await f.attemptStore.get(f.req.body.clientRequestId)).state,'REJECTED_BEFORE_TRANSPORT');
});

test('normal controller blocks revoked session during bridge wait before transport',async t=>{
  const f=fixture(t,state=>{state.revoked=true;});
  const result=await f.call();
  assert.equal(result.error?.statusCode,401);assert.equal(f.state.sends,0);
  assert.equal((await f.attemptStore.get(f.req.body.clientRequestId)).state,'REJECTED_BEFORE_TRANSPORT');
});

test('normal controller rejects expiry and fingerprint changes at the transport boundary',async t=>{
  for(const [name,change] of [
    ['expired',s=>{s.expiresAt=Date.now()-1;}],
    ['role',s=>{s.user={...s.user,role:'mudur'};}],
    ['permission',s=>{s.user={...s.user,permissions:['crm.view']};}],
    ['password',s=>{s.user={...s.user,passwordHash:'synthetic-changed'};}],
    ['agent',s=>{s.user={...s.user,chatwootAgentId:3};}],
  ]) await t.test(name,async t=>{
    const f=fixture(t,change),result=await f.call();
    assert.equal(result.error?.statusCode,401);assert.equal(f.state.sends,0);
    assert.equal((await f.attemptStore.get(f.req.body.clientRequestId)).state,'REJECTED_BEFORE_TRANSPORT');
  });
});

test('confirmed normal send stays truthful after later revoke; duplicate never transports again',async t=>{
  const f=fixture(t);f.state.afterSend=()=>{f.state.revoked=true;};
  const first=await f.call();assert.equal(first.error,undefined);assert.equal(first.status,201);
  assert.equal(first.result.data.delivery.deliveryState,'CONFIRMED');assert.equal(f.state.sends,1);
  f.state.revoked=false;
  const replay=await f.call();assert.equal(replay.error,undefined);assert.equal(replay.result.data.duplicate,true);assert.equal(f.state.sends,1);
});

test('normal controller preserves uncertain-send no-retry behavior',async t=>{
  const f=fixture(t);f.state.proof=false;
  const first=await f.call();assert.equal(first.error?.code,'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY');
  const replay=await f.call();assert.equal(replay.error?.code,'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY');assert.equal(f.state.sends,1);
});

test('existing normal manager and TEST ADMIN send contracts remain valid without requiring a new SID',async t=>{
  for(const actor of [{role:'patron'},{role:'mudur'},{role:'patron',testAdmin:true}])await t.test(JSON.stringify(actor),async t=>{
    const f=fixture(t);Object.assign(f.req.user,actor);f.state.user={...f.req.user};
    const result=await f.call();assert.equal(result.error,undefined);assert.equal(result.status,201);assert.equal(f.state.sends,1);
  });
});

test('normal controller retains crm.send permission requirement before creating an attempt',async t=>{
  const f=fixture(t);f.req.user.permissions=['crm.view'];f.state.user={...f.req.user};
  const result=await f.call();assert.equal(result.error?.code,'WHATSAPP_CRM_PERMISSION_DENIED');assert.equal(f.state.sends,0);
  assert.equal(await f.attemptStore.get(f.req.body.clientRequestId),null);
});
