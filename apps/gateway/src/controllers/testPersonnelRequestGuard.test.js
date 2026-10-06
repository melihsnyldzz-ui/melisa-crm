import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../../node_modules/jsonwebtoken/index.js';
import {createTestPersonnelRequestGuard} from './conversationController.js';
import {installTestPersonnelSession,verifyTestPersonnelSession} from '../services/testPersonnelSession.mjs';

function fixture() {
  let user={id:'fixture-ahmet',username:'crm-ahmet',role:'personel',active:true,chatwootAgentId:3,permissions:['crm.view']};
  const issue=installTestPersonnelSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401',username:user.username,resolveUser:()=>user});
  const token=issue().accessToken;
  return {token,req:{user:verifyTestPersonnelSession(token),get:()=>`Bearer ${token}`},setUser:value=>{user=value;},getUser:()=>user};
}

test('TEST staff token expiry during fresh assignment read suppresses the result',async t=>{
  const f=fixture(),oldNow=Date.now;t.after(()=>{Date.now=oldNow;});
  let release;
  const guard=createTestPersonnelRequestGuard(f.req,{verify:verifyTestPersonnelSession,readAccess:()=>new Promise(resolve=>{release=resolve;})});
  const result=guard({conversationId:'55'});
  Date.now=()=>jwt.decode(f.token).exp*1000+1000;release();
  await assert.rejects(result,error=>error.code==='AUTH_TOKEN_INVALID');
});

test('real configured actor revocation during provider wait is checked again before returning',async()=>{
  const f=fixture();let release;
  const guard=createTestPersonnelRequestGuard(f.req,{verify:verifyTestPersonnelSession,readAccess:()=>new Promise(resolve=>{release=resolve;})});
  const result=guard({conversationId:'55'});
  f.setUser({...f.getUser(),active:false});release();
  await assert.rejects(result,error=>error.code==='AUTH_TOKEN_INVALID');
});

test('send permission, actor identity and fresh assignment cannot be substituted',async()=>{
  const f=fixture();let reads=0;
  const denied=createTestPersonnelRequestGuard(f.req,{verify:()=>({...f.req.user,permissions:['crm.view']}),readAccess:async()=>{reads++;}});
  await assert.rejects(denied({permission:'crm.send',conversationId:'55'}),error=>error.code==='WHATSAPP_CRM_PERMISSION_DENIED');
  const changed=createTestPersonnelRequestGuard(f.req,{verify:()=>({...f.req.user,id:'another-staff'}),readAccess:async()=>{reads++;}});
  await assert.rejects(changed(),error=>error.code==='AUTH_TOKEN_INVALID');assert.equal(reads,0);
  const reassigned=createTestPersonnelRequestGuard(f.req,{verify:verifyTestPersonnelSession,readAccess:async()=>{throw Object.assign(Error('reassigned'),{code:'WHATSAPP_CRM_CONVERSATION_FORBIDDEN',statusCode:403});}});
  await assert.rejects(reassigned({permission:'crm.send',conversationId:'55'}),error=>error.code==='WHATSAPP_CRM_CONVERSATION_FORBIDDEN');
});

test('normal personnel and managers retain the existing request path without extra provider calls',()=>{
  const hooks={verify:()=>{throw Error('must not verify');},readAccess:()=>{throw Error('must not read');}};
  assert.equal(createTestPersonnelRequestGuard({user:{role:'personel'}},hooks),null);
  assert.equal(createTestPersonnelRequestGuard({user:{role:'patron'}},hooks),null);
});
