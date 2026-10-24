import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {configuredTerminalHandoffPeer,isTerminalPeerProof} from './terminalHandoffPeer.mjs';
import {validateTerminalIdentity,validateTerminalRequest} from '../../../../packages/contracts/terminal-handoff.mjs';

const random=()=>crypto.randomBytes(32).toString('base64url');
const config=()=>({CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_PORT_BASE:'62800',
 CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',
 CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json',
 WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',CRM_TERMINAL_HANDOFF_ENABLED:'true',CRM_TERMINAL_PEER_KEY:random()});
const input=()=>({code:random(),requestId:crypto.randomUUID(),deviceBinding:'a'.repeat(64),codeVerifier:random(),erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'});
const identity=()=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800',
 erpUserId:15,erpNormalSessionId:'e1000001-0000-4000-8000-000000000001',crmUserId:'clean-staff-20261022',chatwootAgentId:2,bindingRevision:'b'.repeat(64),expiresAt:15000});

test('terminal peer is default-off and only exact closed clean config permits fixed bounded server RPC',async()=>{
 assert.equal(configuredTerminalHandoffPeer({config:{}}),null);
 for(const changes of [{CRM_TEST_PROFILE:'LIVE'},{WHATSAPP_SEND_ENABLED:'true'},{CRM_TEST_ERP_ORIGIN:'http://other:4194'},{CRM_TERMINAL_PEER_KEY:'invalid'}])assert.throws(()=>configuredTerminalHandoffPeer({config:{...config(),...changes}}));
 const c=config(),body=input(),calls=[];
 const peer=configuredTerminalHandoffPeer({config:c,now:()=>1000,fetchFn:async(url,options)=>{
  calls.push({url,options});assert.equal(url,'http://127.0.0.1:4194/api/auth/terminal-handoff/redeem');
  assert(options.headers['x-melisa-terminal-peer']===c.CRM_TERMINAL_PEER_KEY);assert.equal(options.redirect,'error');assert(options.signal);
  return Response.json({success:true,data:{version:1,linkId:random(),linkExpiresAt:60000,terminalIdentity:identity()}});
 }});
 const proof=await peer.redeem(body);assert(isTerminalPeerProof(proof));assert(!isTerminalPeerProof(structuredClone(proof)));assert.equal(calls.length,1);
 assert(!JSON.stringify(proof).includes(body.code));assert(!JSON.stringify(proof).includes(body.codeVerifier));assert(!JSON.stringify(proof).includes(c.CRM_TERMINAL_PEER_KEY));
 c.CRM_TERMINAL_HANDOFF_ENABLED='false';await assert.rejects(()=>peer.verify(proof));assert.equal(calls.length,1);
});

test('request and identity schemas reject credentials, ambiguous audience, coercions and stale/long assertions',()=>{
 for(const changes of [{accessToken:random()},{code:[random()]},{requestId:'bad'},{deviceBinding:['a'.repeat(64)]},{crmOrigin:'http://192.168.1.46:62800'}])assert.throws(()=>validateTerminalRequest({...input(),...changes}));
 for(const changes of [{confirmed:true},{erpNormalSessionId:[identity().erpNormalSessionId]},{bindingRevision:[identity().bindingRevision]},
  {expiresAt:1000},{expiresAt:31001},{database:'LIVE'}])assert.throws(()=>validateTerminalIdentity({...identity(),...changes},{now:1000}));
 assert(validateTerminalIdentity(identity(),{now:1000}));
});

test('peer rejects invalid/oversized/redirected responses and separates transient failure from revoke',async()=>{
 for(const response of [Response.json({success:true,data:{confirmed:true}}),new Response('invalid',{status:200}),new Response('x'.repeat(17000)),new Response(null,{status:302}),new Response(null,{status:503})]){
  const peer=configuredTerminalHandoffPeer({config:config(),now:()=>1000,fetchFn:async()=>response});await assert.rejects(()=>peer.redeem(input()));
 }
 const denied=configuredTerminalHandoffPeer({config:config(),fetchFn:async()=>new Response(null,{status:403})});await assert.rejects(()=>denied.redeem(input()),{statusCode:403});
 const down=configuredTerminalHandoffPeer({config:config(),fetchFn:async()=>{throw Error('offline fixture');}});await assert.rejects(()=>down.redeem(input()),{statusCode:503});
});
