import '../../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {createManagementFixture} from './fixtures/cleanManagementFixture.mjs';

const random=()=>crypto.randomBytes(32).toString('base64url');
const JOURNAL='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';

// The callback replaces only the fixed ERP terminal peer. Public CRM routes,
// normal management/auth/grant policy and the private RAM journals are real.
function memoryPeer(){
  const codes=new Map(),links=new Map(),calls=[];let person=100;
  const deny=()=>Response.json({success:false,error:{code:'SYNTHETIC_PEER_DENIED'}},{status:403});
  const fresh=link=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',
    erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800',erpUserId:link.erpUserId,erpNormalSessionId:link.erpNormalSessionId,
    crmUserId:link.actor.id,chatwootAgentId:link.actor.chatwootAgentId,bindingRevision:link.bindingRevision,expiresAt:Date.now()+15000});
  const prepare=actor=>{
    const body={code:random(),requestId:crypto.randomUUID(),deviceBinding:crypto.createHash('sha256').update(random()).digest('hex'),codeVerifier:random(),
      erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'};
    codes.set(body.code,{body,actor:{id:actor.id,chatwootAgentId:actor.chatwootAgentId},erpUserId:++person,erpNormalSessionId:crypto.randomUUID(),bindingRevision:crypto.randomBytes(32).toString('hex'),used:false});
    return body;
  };
  const fetch=async(url,options)=>{
    assert.match(String(url),/^http:\/\/127\.0\.0\.1:4194\/api\/auth\/terminal-handoff\/(redeem|verify|revoke)$/);
    assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.equal(options.headers['x-melisa-terminal-peer']===process.env.CRM_TERMINAL_PEER_KEY,true);
    const action=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);calls.push(action);
    if(action==='redeem'){
      const code=codes.get(body.code);
      if(!code||code.used||JSON.stringify(body)!==JSON.stringify(code.body))return deny();code.used=true;
      const linkId=random(),link={...code,linkId,linkExpiresAt:Date.now()+90000,revoked:false};links.set(linkId,link);
      return Response.json({success:true,data:{version:1,linkId,linkExpiresAt:link.linkExpiresAt,terminalIdentity:fresh(link)}});
    }
    const link=links.get(body.linkId);
    if(!link||['requestId','deviceBinding','erpOrigin','crmOrigin'].some(key=>link.body[key]!==body[key]))return deny();
    if(action==='revoke'){link.revoked=true;return Response.json({success:true,data:{revoked:true}});}
    if(link.revoked)return deny();
    return Response.json({success:true,data:{version:1,linkExpiresAt:link.linkExpiresAt,terminalIdentity:fresh(link)}});
  };
  return {prepare,fetch,calls,links};
}

test('B5 managed personnel and actual mudur share normal management, linked terminal grants and current ERP authority',
  {skip:process.platform!=='win32'?'Exact private Windows paths use the existing Windows fixture.':false},async t=>{
  const peer=memoryPeer(),f=await createManagementFixture({terminalHandoff:true,peerFetch:peer.fetch});t.after(()=>f.close());
  const login=async(username,password=f.password)=>{
    const reply=await f.call('/auth/login',{body:{username,password,transport:'native'}});assert.equal(reply.status,200);return reply.data;
  };
  const baselineManager=await login('ornek-mudur'),baselineStaff=await login('ornek-personel');
  const inventory=async()=>{const reply=await f.call('/crm/users',{token:baselineManager.accessToken});assert.equal(reply.status,200);return reply.data;};
  const baselineAccounts=(await inventory()).accounts;
  const create=async(username,role,chatwootAgentId)=>{
    const input={revision:(await inventory()).management.revision,username,displayName:'Synthetic '+username,role,active:true,chatwootAgentId,password:random()};
    const reply=await f.call('/crm/users',{token:baselineManager.accessToken,body:input});assert.equal(reply.status,201);
    return {...reply.data.account,password:input.password};
  };
  const personel=await create('synthetic-terminal-personel','personel',1001),mudur=await create('synthetic-terminal-mudur','mudur',1002);
  const handoff=actor=>f.call('/auth/terminal-handoff',{body:peer.prepare(actor)});
  const linked=async actor=>{const reply=await handoff(actor);assert.equal(reply.status,200);return reply.data;};
  const grants=()=>JSON.parse(f.memory.text(JOURNAL)||'{"grants":[]}').grants;
  const family=session=>grants().find(row=>row.sid===jwt.decode(session.accessToken).normalSessionId);
  const verifyBaseline=async()=>{
    assert.equal((await f.call('/auth/me',{token:baselineStaff.accessToken})).status,200);
    assert.equal((await f.call('/auth/me',{token:baselineManager.accessToken})).status,200);
  };
  const edit=async(actor,changes={})=>{
    const body={revision:(await inventory()).management.revision,username:actor.username,displayName:actor.displayName,role:actor.role,active:actor.active,chatwootAgentId:actor.chatwootAgentId,...changes};
    const reply=await f.call('/crm/users/'+actor.id,{method:'PATCH',token:baselineManager.accessToken,body});assert.equal(reply.status,200);return {...actor,...reply.data.account};
  };

  await t.test('normally created personnel handoff sees only its assigned managed conversation',async()=>{
    assert.equal((await f.call('/crm/conversations/155/assign',{token:baselineManager.accessToken,body:{agentId:personel.chatwootAgentId}})).status,200);
    const session=await linked(personel);assert.equal(session.user.id,personel.id);assert.equal(session.user.role,'personel');assert.equal(session.user.normalRefreshSession,true);
    assert.equal(session.user.terminalIdentity.crmUserId,personel.id);assert.equal(Boolean(family(session).terminalLink),true);
    const inbox=await f.call('/crm/inbox',{token:session.accessToken});assert.equal(inbox.status,200);assert.deepEqual(inbox.data.conversations.map(row=>row.id),['155']);
    assert.equal((await f.call('/crm/conversations/155',{token:session.accessToken})).status,200);
    assert.equal((await f.call('/crm/conversations/156',{token:session.accessToken})).status,403);
    assert.equal((await f.call('/crm/users',{token:session.accessToken})).status,403);
    assert.equal((await f.call('/crm/conversations/156/assign',{token:session.accessToken,body:{agentId:personel.chatwootAgentId}})).status,403);
  });

  await t.test('actual managed mudur handoff keeps management permissions and reads all four conversations',async()=>{
    const session=await linked(mudur);assert.equal(session.user.role,'mudur');assert.equal(session.user.id,mudur.id);
    assert.equal(session.user.terminalIdentity.crmUserId,mudur.id);assert.equal(session.user.terminalIdentity.chatwootAgentId,mudur.chatwootAgentId);
    assert.equal(session.user.permissions.includes('crm.manage'),true);assert.equal(session.user.permissions.includes('crm.assign'),true);
    const me=await f.call('/auth/me',{token:session.accessToken});assert.equal(me.status,200);assert.equal(me.data.role,'mudur');
    const inbox=await f.call('/crm/inbox',{token:session.accessToken});assert.equal(inbox.status,200);assert.deepEqual(inbox.data.conversations.map(row=>row.id).sort(),['155','156','55','56']);
    assert.equal((await f.call('/crm/users',{token:session.accessToken})).status,200);assert.equal((await f.call('/crm/agents',{token:session.accessToken})).status,200);
    const assignment=await f.call('/crm/conversations/156/assign',{token:session.accessToken,body:{agentId:personel.chatwootAgentId}});assert.equal(assignment.status,200);assert.equal(assignment.data.confirmed,true);
    assert.equal((await f.call('/crm/conversations/156/assign',{token:session.accessToken,body:{agentId:null}})).status,200);
    const rotated=await f.call('/auth/refresh',{body:{refreshToken:session.refreshToken}});assert.equal(rotated.status,200);assert.equal(rotated.data.user.role,'mudur');
    assert.equal(jwt.decode(rotated.data.accessToken).normalSessionId===jwt.decode(session.accessToken).normalSessionId,true);
    assert.equal((await f.call('/auth/refresh',{body:{refreshToken:session.refreshToken}})).status,401);
  });

  await t.test('normal baseline patron is not a terminal actor and baseline including Semih remains uneditable',async()=>{
    const count=grants().length;
    assert.equal((await handoff({id:'clean-manager-20261022',chatwootAgentId:1})).status,403);assert.equal(grants().length,count);
    for(const id of ['clean-manager-20261022','clean-semih-20261023']){
      const body={revision:(await inventory()).management.revision,username:'synthetic-terminal-protected',displayName:'Synthetic protected',role:'mudur',active:true,chatwootAgentId:1003};
      assert.equal((await f.call('/crm/users/'+id,{method:'PATCH',token:baselineManager.accessToken,body})).status,403);
    }
    const after=(await inventory()).accounts.filter(row=>baselineAccounts.some(original=>original.userId===row.userId));assert.deepEqual(after,baselineAccounts);
    await verifyBaseline();
  });

  await t.test('managed mudur revision role agent and inactive edits invalidate its old linked JWT and refresh',async()=>{
    let actor=mudur;
    for(const change of [{displayName:'Synthetic revised mudur'},{role:'personel'},{chatwootAgentId:1003},{active:false}]){
      const session=await linked(actor),original={...actor};actor=await edit(actor,change);
      assert.equal((await f.call('/auth/me',{token:session.accessToken})).status,401);
      assert.equal((await f.call('/auth/refresh',{body:{refreshToken:session.refreshToken}})).status,401);
      actor=await edit(actor,{displayName:original.displayName,role:original.role,chatwootAgentId:original.chatwootAgentId,active:original.active});
      assert.equal((await f.call('/auth/me',{token:session.accessToken})).status,401);
      assert.equal((await f.call('/auth/refresh',{body:{refreshToken:session.refreshToken}})).status,401);await verifyBaseline();
    }
  });

  await t.test('fresh ERP peer binding revoke closes only its linked mudur family, preserving normal and linked siblings',async()=>{
    const normal=await login(mudur.username,mudur.password),own=await linked(mudur),sibling=await linked(mudur);
    const ownFamily=family(own);peer.links.get(ownFamily.terminalLink.linkId).revoked=true;
    assert.equal((await f.call('/auth/me',{token:own.accessToken})).status,403);
    assert.equal((await f.call('/auth/refresh',{body:{refreshToken:own.refreshToken}})).status,401);
    assert.equal(family(own).revoked,true);
    assert.equal((await f.call('/auth/me',{token:sibling.accessToken})).status,200);assert.equal(family(sibling).revoked,false);
    assert.equal((await f.call('/auth/me',{token:normal.accessToken})).status,200);assert.equal(family(normal).revoked,false);await verifyBaseline();
    const journal=f.memory.text(JOURNAL);for(const secret of [own.accessToken,own.refreshToken,mudur.password,process.env.CRM_TERMINAL_PEER_KEY])assert.equal(journal.includes(secret),false);
    assert.equal(peer.calls.includes('redeem')&&peer.calls.includes('verify')&&peer.calls.includes('revoke'),true);
  });
});
