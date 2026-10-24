import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { createPasswordHash, findCrmUserById } from './crmAuthService.js';
import { getChatwootProductRequestBinding } from './chatwootInboxService.js';

async function fixture(work) {
  const chatwoot={...env.chatwoot},whatsapp={...env.whatsapp},auth={...env.auth,users:env.auth.users},fetchBefore=global.fetch;
  const keys=['CRM_ISOLATED_PREPARATION','CRM_TEST_EXPECTED_DATABASE'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'});
  Object.assign(env.chatwoot,{baseUrl:'http://fixture-chatwoot.invalid',accountId:1,inboxId:2,apiAccessToken:'fixture-read-only-key',includeGroups:false});
  Object.assign(env.whatsapp,{testNumberOnly:true,allowedTestNumbers:['+905387217733'],sendEnabled:false,liveSendApproved:false});
  const personel={id:'fixture-personel-binding',username:'fixture-personel-binding',role:'personel',active:true,chatwootAgentId:2,passwordHash:createPasswordHash('Only-Offline-Binding-2026!','binding-fixture-salt')};
  const manager={...personel,id:'fixture-manager-binding',username:'fixture-manager-binding',role:'patron'};
  Object.assign(env.auth,{personnelCanSend:false,users:[personel,manager]});
  let row={id:55,account_id:1,inbox_id:2,meta:{sender:{id:101,phone_number:'+905387217733'},assignee:{id:2}}},onRead=()=>{};const calls=[];
  global.fetch=async(url,options)=>{calls.push({url:String(url),method:options.method});onRead();return new Response(JSON.stringify(row),{status:200});};
  try{return await work({user:findCrmUserById(personel.id),manager:findCrmUserById(manager.id),personel,calls,setRow:value=>{row=value;},row:()=>structuredClone(row),onRead:value=>{onRead=value;}});}
  finally{Object.assign(env.chatwoot,chatwoot);Object.assign(env.whatsapp,whatsapp);Object.assign(env.auth,auth);global.fetch=fetchBefore;for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
}

test('genuine Chatwoot TEST tuple has external namespace and fingerprint only, without PG/messages/writes',()=>fixture(async f=>{
 const binding=await getChatwootProductRequestBinding({conversationId:'55',user:f.user});
 assert.deepEqual({...binding,customerFingerprint:undefined},{backend:'chatwoot',provider:'chatwoot',accountId:'1',inboxId:'2',chatwootConversationId:'55',chatwootContactId:'101',assigneeId:'2',customerFingerprint:undefined});
 assert.match(binding.customerFingerprint,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(binding).includes('905387217733'),false);assert.equal(binding.localConversationId,undefined);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'GET');assert(f.calls[0].url.endsWith('/accounts/1/conversations/55'));
}));
test('missing/foreign tuple, actual non-allowlisted phone, group and wrong conversation cannot map',()=>fixture(async f=>{
 const original=f.row();
 for(const row of [{...original,id:56},{...original,account_id:2},{...original,inbox_id:3},
  {...original,meta:{...original.meta,sender:{id:101}}},{...original,meta:{...original.meta,sender:{id:102,phone_number:'+905551234567'}}},
  {...original,meta:{...original.meta,assignee:{}}},{...original,meta:{...original.meta,sender:{...original.meta.sender,identifier:'fixture@g.us'}}}]){
  f.setRow(row);await assert.rejects(getChatwootProductRequestBinding({conversationId:'55',user:f.manager}));
 }
}));
test('fresh normal role and assignment checks survive account/permission/actor changes during read',()=>fixture(async f=>{
 const original=f.row();f.setRow({...original,meta:{...original.meta,assignee:{id:3}}});
 await assert.rejects(getChatwootProductRequestBinding({conversationId:'55',user:f.user}),{code:'WHATSAPP_CRM_CONVERSATION_FORBIDDEN'});f.setRow(original);
 f.onRead(()=>{f.personel.active=false;});await assert.rejects(getChatwootProductRequestBinding({conversationId:'55',user:f.user}),{code:'CUSTOMER_REQUEST_FORBIDDEN'});
}));
test('default/LIVE or missing exact approved TEST allowlist stops before any Chatwoot request',()=>fixture(async f=>{
 for(const mutate of [()=>{process.env.CRM_ISOLATED_PREPARATION='false';},()=>{process.env.CRM_TEST_EXPECTED_DATABASE='LIVE';},()=>{env.whatsapp.allowedTestNumbers=[];}]){
  process.env.CRM_ISOLATED_PREPARATION='true';process.env.CRM_TEST_EXPECTED_DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_02';env.whatsapp.allowedTestNumbers=['905387217733'];mutate();
  await assert.rejects(getChatwootProductRequestBinding({conversationId:'55',user:f.user}),{code:'CUSTOMER_REQUEST_BINDING_UNAVAILABLE'});
 }
 assert.equal(f.calls.length,0);
}));
