import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { authenticateCrmUser, createPasswordHash, verifyCrmAccessToken } from '../services/crmAuthService.js';
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


test('ordinary personnel inbox never returns data after its normal authority changes', async t => {
  for (const mode of ['current','inactive','role','agent','password','permission','token']) await t.test(mode, async t => {
    const original={fetch:global.fetch,auth:{...env.auth},chatwoot:{...env.chatwoot},whatsapp:{...env.whatsapp}};
    t.after(()=>{global.fetch=original.fetch;Object.assign(env.auth,original.auth);Object.assign(env.chatwoot,original.chatwoot);Object.assign(env.whatsapp,original.whatsapp);});
    const password='synthetic-test-password';
    const configured={id:'ordinary-fixture',username:'ordinary-fixture',role:'personel',active:true,chatwootAgentId:7,passwordHash:createPasswordHash(password,'synthetic-normal-inbox-salt')};
    Object.assign(env.auth,{jwtSecret:'synthetic-normal-inbox-secret-longer-than-32',issuer:'normal-inbox-fixture',audience:'normal-inbox-fixture',tokenExpiresIn:'5m',personnelCanSend:false,users:[configured]});
    Object.assign(env.chatwoot,{baseUrl:'http://chatwoot.local',accountId:2,inboxId:1,apiAccessToken:'normal-fixture-'+mode,inboxReadEnabled:true,inboxFallbackEnabled:true,includeGroups:false});
    Object.assign(env.whatsapp,{provider:'evolution',sendEnabled:false});
    const token=authenticateCrmUser({username:configured.username,password}).accessToken;
    const user=verifyCrmAccessToken(token);let payload,error;
    global.fetch=async url=>{
      if(String(url).includes('/messages')) {
        if(mode==='inactive')configured.active=false;
        if(mode==='role')configured.role='mudur';
        if(mode==='agent')configured.chatwootAgentId=8;
        if(mode==='password')configured.passwordHash='changed';
        if(mode==='permission')env.auth.personnelCanSend=true;
        if(mode==='token')env.auth.jwtSecret+='changed';
        return Response.json({payload:[{id:7,conversation_id:1,message_type:0,content:'Must not escape changed authority'}]});
      }
      const row={id:1,inbox_id:1,status:'open',meta:{sender:{name:'Own customer'},assignee:{id:7}}};
      return Response.json({data:{meta:{all_count:1},payload:[row]}});
    };
    await getInboxController({query:{},user,get:()=>`Bearer ${token}`},{status(){return this;},json:value=>{payload=value;}},value=>{error=value;});
    if(mode==='current'){assert.equal(error,undefined);assert.equal(payload.data.conversations[0].messages[0].text,'Must not escape changed authority');}
    else{assert.equal(payload,undefined);assert.equal(error?.statusCode,401);}
  });
});
