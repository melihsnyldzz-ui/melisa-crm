import test from 'node:test';
import assert from 'node:assert/strict';
import {env} from '../config/env.js';
import {WAAPI_RECIPIENT} from '../providers/waapiProvider.js';
import {sendCrmTextMessage} from './sendService.js';
import {createMemoryOutboundAttemptStore} from './outboundAttemptService.js';

function setup(t){
  const original={...env.whatsapp};t.after(()=>Object.assign(env.whatsapp,original));
  Object.assign(env.whatsapp,{provider:'waapi',sendEnabled:true,liveSendApproved:true,testNumberOnly:true,allowedTestNumbers:[WAAPI_RECIPIENT]});
  const attemptStore=createMemoryOutboundAttemptStore();attemptStore.reset();
  const calls=[],deps={attemptStore,provider:{sendMessage:async()=>{calls.push('send');return {provider:'waapi',providerMessageId:'guard-fixture',text:'proof'};}},
    bridge:{assertSafe:async()=>{calls.push('safe');},resolveConversation:async()=>{calls.push('resolve');},sync:async()=>{calls.push('sync');}},
    journal:{accept:async()=>{calls.push('journal');}},verifyDeliveryProof:async()=>({confirmed:true,chatwootMessageId:'fixture-message'})};
  const payload={phone:WAAPI_RECIPIENT,conversationId:'55',text:'proof',actorId:'fixture-ahmet',clientRequestId:'PERSONNEL-GUARD-REQUEST-001'};
  return {deps,calls,payload};
}

test('expiry after bridge preflight rejects before message transport and records a truthful non-send',async t=>{
  const {deps,calls,payload}=setup(t);let allowed=true;
  const updates=[],update=deps.attemptStore.update;
  deps.attemptStore.update=async(...args)=>{const state=await update(...args);updates.push(state);return state;};
  deps.bridge.resolveConversation=async()=>{calls.push('resolve');await Promise.resolve();allowed=false;};
  deps.beforeProviderSend=async()=>{calls.push('guard');if(!allowed)throw Object.assign(Error('expired'),{code:'AUTH_TOKEN_EXPIRED',statusCode:401});};
  await assert.rejects(sendCrmTextMessage(payload,deps),error=>error.code==='AUTH_TOKEN_EXPIRED'&&error.meta.transportAttempted===false);
  assert.deepEqual(calls,['safe','resolve','guard']);
  assert.equal(updates.at(-1).state,'REJECTED_BEFORE_TRANSPORT');
  await assert.rejects(sendCrmTextMessage(payload,deps),error=>error.code==='WHATSAPP_CRM_DUPLICATE_REQUEST');
  assert.equal(calls.includes('send'),false);assert.equal(calls.includes('journal'),false);
});

test('assignment guard runs after bridge waits and confirmed UUID replay cannot send twice',async t=>{
  const {deps,calls,payload}=setup(t);deps.beforeProviderSend=async()=>{calls.push('guard');};
  await sendCrmTextMessage(payload,deps);await sendCrmTextMessage(payload,deps);
  assert.deepEqual(calls,['safe','resolve','guard','send','journal','sync']);
});
