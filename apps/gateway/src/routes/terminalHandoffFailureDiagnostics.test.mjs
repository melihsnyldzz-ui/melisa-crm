import '../../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createManagementFixture} from './fixtures/cleanManagementFixture.mjs';
import {logger} from '../utils/logger.js';

const random=()=>crypto.randomBytes(32).toString('base64url');
const JOURNAL='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';
const diagnosticKeys=['terminalStage','terminalReason','terminalPeerStatus','terminalChangedFields','terminalLinkExpiryEqual'];

test('trusted terminal diagnostics are nonserialized, bounded and cannot be forged with public metadata',async()=>{
  const {annotateTerminalFailure,terminalFailureForLog}=await import('../../../../packages/contracts/terminal-handoff.mjs');
  const error=Object.assign(Error('Synthetic generic rejection'),{statusCode:403,code:'CRM_TERMINAL_IDENTITY_REQUIRED'});
  const before=JSON.stringify(error);
  annotateTerminalFailure(error,{stage:'peer-verify',reason:'binding-changed',changedFields:['bindingRevision'],peerStatus:403,linkExpiryEqual:true});
  assert.deepEqual(terminalFailureForLog(error),{terminalStage:'peer-verify',terminalReason:'binding-changed',terminalPeerStatus:403,terminalChangedFields:['bindingRevision'],terminalLinkExpiryEqual:true});
  assert.equal(JSON.stringify(error),before);
  assert.equal(Object.keys(error).some(key=>diagnosticKeys.includes(key)),false);
  annotateTerminalFailure(error,{stage:'fresh-verification',reason:'stored-binding'});
  assert.equal(terminalFailureForLog(error).terminalStage,'peer-verify','outer context must preserve the original internal failure');
  assert.equal(terminalFailureForLog(error).terminalReason,'binding-changed');
  const secret=random();
  for(const metadata of [
    {stage:secret,reason:'identity-invalid'},
    {stage:'peer-verify',reason:secret},
    {stage:'peer-verify',reason:'binding-changed',changedFields:[secret]},
    {stage:'peer-verify',reason:'peer-http-status',peerStatus:secret},
    {stage:'peer-verify',reason:'peer-http-status',peerStatus:'403'},
    {stage:'peer-verify',reason:'peer-http-status',peerStatus:99},
    {stage:'peer-verify',reason:'peer-http-status',peerStatus:600},
  ]){
    const rejected=Error('Synthetic generic rejection');annotateTerminalFailure(rejected,metadata);
    const safe=terminalFailureForLog(rejected),text=JSON.stringify(safe);
    assert.equal(text.includes(secret),false);assert.equal(text.includes('"403"'),false);
    assert.equal(safe.terminalPeerStatus===99||safe.terminalPeerStatus===600,false);
    if(metadata.stage===secret||metadata.reason===secret)assert.deepEqual(safe,{});
    if(metadata.changedFields)assert.equal(safe.terminalChangedFields?.includes(secret)??false,false);
  }
  const forged=Object.assign(Error('Synthetic generic rejection'),{terminalStage:'peer-verify',terminalReason:'binding-changed',meta:{terminalStage:'peer-verify',terminalReason:'binding-changed',terminalChangedFields:['bindingRevision']}});
  forged[Symbol('terminalFailure')]={terminalStage:'peer-verify',terminalReason:'binding-changed'};
  assert.deepEqual(terminalFailureForLog(forged),{});assert.deepEqual(terminalFailureForLog(null),{});
});

test('real terminal publication failures log only trusted phase facts while retaining generic denial and own-family cleanup',
  {skip:process.platform!=='win32'?'Exact production journal fixture uses Windows private paths.':false},async t=>{
  let clock=Math.floor(Date.now()/1000)*1000+100;t.mock.method(Date,'now',()=>clock);
  const codes=new Map(),links=new Map(),trace=[],events=[];
  t.mock.method(logger,'error',(label,fields)=>events.push({label,fields:structuredClone(fields)}));
  const identity=link=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',
    erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800',erpUserId:72001,erpNormalSessionId:'a2000001-0000-4000-8000-000000000001',
    crmUserId:link.actor.id,chatwootAgentId:link.actor.chatwootAgentId,bindingRevision:'b'.repeat(64),expiresAt:Math.min(clock+15000,link.linkExpiresAt)});
  const peerFetch=async(url,options)=>{
    assert.match(String(url),/^http:\/\/127\.0\.0\.1:4194\/api\/auth\/terminal-handoff\/(redeem|verify|revoke)$/);
    assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['x-melisa-terminal-peer']===process.env.CRM_TERMINAL_PEER_KEY,true);
    const action=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);trace.push(action);
    if(action==='redeem'){
      const code=codes.get(body.code);assert(code);assert.equal(JSON.stringify(body)===JSON.stringify(code.body),true);codes.delete(body.code);
      const linkId=random(),link={...code,linkId,linkExpiresAt:clock+code.lifetime,revoked:false};links.set(linkId,link);
      return Response.json({success:true,data:{version:1,linkId,linkExpiresAt:link.linkExpiresAt,terminalIdentity:identity(link)}});
    }
    const link=links.get(body.linkId);assert(link);
    if(action==='revoke'){link.revoked=true;return Response.json({success:true,data:{revoked:true}});}
    if(link.mode==='peer-denied')return Response.json({success:false},{status:403});
    clock+=link.advance;const data={version:1,linkExpiresAt:link.linkExpiresAt,terminalIdentity:identity(link)};
    if(['link-expiry-changed','link-expiry-changed-201'].includes(link.mode))data.linkExpiresAt++;
    if(link.mode==='binding-changed')data.terminalIdentity.bindingRevision='c'.repeat(64);
    if(link.mode==='assertion-outlives-link')data.terminalIdentity.expiresAt=link.linkExpiresAt+1;
    return Response.json({success:true,data},{status:link.mode==='link-expiry-changed-201'?201:200});
  };
  const f=await createManagementFixture({terminalHandoff:true,peerFetch});t.after(()=>f.close());
  const login=async username=>{const reply=await f.call('/auth/login',{body:{username,password:f.password,transport:'native'}});assert.equal(reply.status,200);return reply.data;};
  const manager=await login('ornek-mudur'),sibling=await login('ornek-personel');
  const overview=await f.call('/crm/users',{token:manager.accessToken});assert.equal(overview.status,200);
  const created=await f.call('/crm/users',{token:manager.accessToken,body:{revision:overview.data.management.revision,username:'synthetic-diagnostic-personel',displayName:'Synthetic diagnostic Personel',role:'personel',active:true,chatwootAgentId:1001,password:random()}});assert.equal(created.status,201);
  const actor=created.data.account,grants=()=>JSON.parse(f.memory.text(JOURNAL)||'{"grants":[]}').grants;
  const prepare=item=>{
    const body={code:random(),requestId:crypto.randomUUID(),deviceBinding:'a'.repeat(64),codeVerifier:random(),erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'};
    codes.set(body.code,{body,actor,mode:item.mode,lifetime:item.lifetime,advance:95});return body;
  };
  for(const item of [
    {name:'valid bounded link publishes without failure diagnostics',mode:'valid',lifetime:15000,status:200},
    {name:'verify HTTP403 retains peer status and stage',mode:'peer-denied',lifetime:60000,status:403,stage:'peer-verify',reason:'peer-http-status',peerStatus:403},
    {name:'changed absolute link expiry logs comparison only',mode:'link-expiry-changed',lifetime:60000,status:403,stage:'peer-verify',reason:'link-expiry-changed',linkExpiryEqual:false},
    {name:'a permitted HTTP201 peer reply retains its actual status when the link is rejected',mode:'link-expiry-changed-201',lifetime:60000,status:403,stage:'peer-verify',reason:'link-expiry-changed',peerStatus:201,linkExpiryEqual:false},
    {name:'changed binding revision logs field name without values',mode:'binding-changed',lifetime:60000,status:403,stage:'peer-verify',reason:'binding-changed',changedFields:['bindingRevision']},
    {name:'assertion exceeding its link logs the narrow lifetime reason',mode:'assertion-outlives-link',lifetime:15000,status:403,stage:'peer-verify',reason:'assertion-outlives-link'},
    {name:'subsecond JWT deadline logs publication phase and retains cleanup',mode:'valid',lifetime:250,status:403,stage:'token-publication',reason:'jwt-deadline'},
  ])await t.test(item.name,async()=>{
    clock=Math.floor(clock/1000)*1000+1100;
    const before=structuredClone(grants()),eventStart=events.length,traceStart=trace.length,body=prepare(item);
    const reply=await f.call('/auth/terminal-handoff',{body});assert.equal(reply.status,item.status);
    const after=grants();assert.equal(after.length,before.length+1);
    assert.equal(JSON.stringify(after.slice(0,before.length))===JSON.stringify(before),true,'earlier normal and linked families must remain byte-equivalent');
    assert.equal(after.at(-1).revoked,item.status!==200);
    const logged=events.slice(eventStart).filter(event=>event.label==='WhatsApp CRM error normalized');
    if(item.status===200){assert.equal(logged.length,0);assert.equal(reply.data.user.id,actor.id);assert.equal(reply.data.user.normalRefreshSession,true);}
    else{
      assert.equal(reply.error.code,'CRM_TERMINAL_IDENTITY_REQUIRED');assert.equal(logged.length,1);
      const event=logged[0].fields;assert.equal(event.terminalStage,item.stage);assert.equal(event.terminalReason,item.reason);
      if(item.peerStatus!==undefined)assert.equal(event.terminalPeerStatus,item.peerStatus);
      if(item.changedFields)assert.deepEqual(event.terminalChangedFields,item.changedFields);
      if(item.linkExpiryEqual!==undefined)assert.equal(event.terminalLinkExpiryEqual,item.linkExpiryEqual);
      assert.deepEqual(trace.slice(traceStart),['redeem','verify','revoke']);
      const linked=links.get(after.at(-1).terminalLink.linkId);assert.equal(linked.revoked,true);
      const publicText=JSON.stringify(reply),logText=JSON.stringify(event);
      for(const key of diagnosticKeys)assert.equal(publicText.includes(key),false);
      for(const value of [body.code,body.codeVerifier,body.requestId,body.deviceBinding,process.env.CRM_TERMINAL_PEER_KEY,
        linked.linkId,actor.id,'MELISA_ERP_CLEAN_TEST_20261022','e662fd94-d797-4b3b-938a-d143ad758b67','a2000001-0000-4000-8000-000000000001','b'.repeat(64),'c'.repeat(64)]){
        assert.equal(publicText.includes(value),false);assert.equal(logText.includes(value),false);
      }
    }
    assert.equal((await f.call('/auth/me',{token:manager.accessToken})).status,200);
    assert.equal((await f.call('/auth/me',{token:sibling.accessToken})).status,200);
  });
});
