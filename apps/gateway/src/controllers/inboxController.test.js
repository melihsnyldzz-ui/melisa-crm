import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { getInboxController } from './inboxController.js';
import {installTestPersonnelSession,verifyTestPersonnelSession} from '../services/testPersonnelSession.mjs';

test('invalid inbox views fail before integration fallback or data access', async () => {
  const oldFallback = env.chatwoot.inboxFallbackEnabled;
  env.chatwoot.inboxFallbackEnabled = true;
  try {
    for (const view of ['', 'unknown', ['bootstrap'], { mode: 'bootstrap' }, null]) {
      let error;
      await getInboxController({ query: { view } }, {
        status() { assert.fail('invalid view must not return a fallback response'); },
        json() { assert.fail('invalid view must not expose inbox data'); },
      }, value => { error = value; });
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.code, 'WHATSAPP_CRM_INBOX_VIEW_INVALID');
    }
  } finally {
    env.chatwoot.inboxFallbackEnabled = oldFallback;
  }
});

test('personnel bootstrap validates all 23 assignments with two fresh read-only filters and suppresses stale or revoked responses',async t=>{
 for(const mode of ['current','reassigned','revoked'])await t.test(mode,async t=>{
  const old={fetch:global.fetch,chatwoot:{...env.chatwoot},whatsapp:{...env.whatsapp},jwtSecret:env.auth.jwtSecret};
  t.after(()=>{global.fetch=old.fetch;Object.assign(env.chatwoot,old.chatwoot);Object.assign(env.whatsapp,old.whatsapp);env.auth.jwtSecret=old.jwtSecret;});
  env.auth.jwtSecret='synthetic-controller-auth-secret-for-offline-only';
  Object.assign(env.chatwoot,{baseUrl:'http://chatwoot.local',accountId:2,inboxId:1,apiAccessToken:'synthetic-controller-'+mode,inboxReadEnabled:true,inboxFallbackEnabled:false,includeGroups:false});
  Object.assign(env.whatsapp,{provider:'evolution',sendEnabled:false});
  let user={id:'fixture-ahmet',username:'crm-ahmet',role:'personel',active:true,chatwootAgentId:3,permissions:['crm.view']};
  const issue=installTestPersonnelSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401',username:user.username,resolveUser:()=>user});
  const token=issue().accessToken;let reads=0,payload,error;
  global.fetch=async(url,options)=>{
   assert(String(url).includes('/conversations/filter?'));assert.equal(options.method,'POST');reads++;
   assert.equal(JSON.parse(options.body).payload[0].values[0],'3');
   if(reads===2&&mode==='revoked')user={...user,active:false};
   const rows=Array.from({length:reads===2&&mode==='reassigned'?22:23},(_,i)=>({id:55+i,inbox_id:1,status:'open',meta:{sender:{name:'Own customer'},assignee:{id:3}}}));
   return Response.json({meta:{all_count:rows.length},payload:rows});
  };
  await getInboxController({query:{view:'bootstrap',limit:100,offset:0},user:verifyTestPersonnelSession(token),get:()=>`Bearer ${token}`},
   {status(){return this;},json:value=>{payload=value;}},value=>{error=value;});
  assert.equal(reads,2);
  if(mode==='current'){assert.equal(error,undefined);assert.equal(payload.data.conversations.length,23);assert(payload.data.conversations.every(row=>row.chatwootAgentId===3&&row.messagesLoaded===false));}
  else{assert.equal(payload,undefined);assert.equal(error?.statusCode,mode==='revoked'?401:403);}
 });
});
