import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {createManagementFixture} from './fixtures/cleanManagementFixture.mjs';
import {CLEAN_MANAGED_USERS_FILE} from '../services/cleanCrmManagement.mjs';

test('B5 production normal management/auth/assignment HTTP lifecycle uses only memory private files and synthetic customers',{skip:process.platform!=='win32'?'Exact production private path is Windows-only; pure store tests run on all platforms.':false},async t=>{
  const f=await createManagementFixture();t.after(()=>f.close());
  const login=async(username,password=f.password)=>{const r=await f.call('/auth/login',{body:{username,password,transport:'native'}});assert.equal(r.status,200);return r.data;};
  const manager=await login('ornek-mudur'),baselineStaff=await login('ornek-personel');
  const inventory=async token=>{const r=await f.call('/crm/users',{token});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.data;};
  const body=async(change={})=>({revision:(await inventory(manager.accessToken)).management.revision,username:'sentetik-a',displayName:'Sentetik Personel A',role:'personel',active:true,chatwootAgentId:1001,password:crypto.randomBytes(24).toString('base64url'),...change});
  let first,second,leader,firstBody,firstSession;
  await t.test('normal manager sees protected baseline and explicit management capability; anonymous and staff cannot create',async()=>{
    const initial=await inventory(manager.accessToken);assert.equal(initial.accounts.length,4);assert.equal(initial.management.revision,0);assert.deepEqual(initial.management.editableAccountIds,[]);assert.equal(initial.coverage.accountsComplete,true);
    for(const token of [undefined,baselineStaff.accessToken]){const r=await f.call('/crm/users',{body:await body(),token});assert.equal(r.status,token?403:401);}
    assert.equal(f.memory.text(CLEAN_MANAGED_USERS_FILE),undefined);
  });
  await t.test('create three persistent personal identities through normal management route, no custom issuer',async()=>{
    firstBody=await body();let r=await f.call('/crm/users',{body:firstBody,token:manager.accessToken});assert.equal(r.status,201);first=r.data.account;
    r=await f.call('/crm/users',{body:await body({username:'sentetik-b',displayName:'Sentetik Personel B',chatwootAgentId:1002}),token:manager.accessToken});assert.equal(r.status,201);second=r.data.account;
    const leaderBody=await body({username:'sentetik-mudur',displayName:'Sentetik Müdür',role:'mudur',chatwootAgentId:1003});r=await f.call('/crm/users',{body:leaderBody,token:manager.accessToken});assert.equal(r.status,201);leader={account:r.data.account,session:await login(leaderBody.username,leaderBody.password)};
    const data=await inventory(manager.accessToken);assert.equal(data.accounts.length,7);assert.equal(data.coverage.accountsComplete,true);assert.deepEqual(data.management.editableAccountIds,[first.id,second.id,leader.account.id]);
    assert.equal(data.accounts.find(row=>row.userId==='clean-semih-20261023').chatwootAgentId,null);assert.equal(JSON.stringify(env.auth.users),f.baseline);
    const serialized=JSON.stringify(data);for(const secret of [firstBody.password,'passwordHash','refreshToken',manager.accessToken,CLEAN_MANAGED_USERS_FILE])assert(!serialized.includes(secret));
  });
  await t.test('new personel receives the existing normal grant; access persists through fresh request and rotated refresh',async()=>{
    firstSession=await login(firstBody.username,firstBody.password);assert(firstSession.refreshToken);assert.equal(firstSession.user.normalRefreshSession,true);assert.equal(firstSession.user.role,'personel');assert.equal(firstSession.user.chatwootAgentId,1001);
    let me=await f.call('/auth/me',{token:firstSession.accessToken});assert.equal(me.status,200);assert.equal(me.data.id,first.id);
    const r=await f.call('/auth/refresh',{body:{refreshToken:firstSession.refreshToken}});assert.equal(r.status,200);assert.equal(r.data.user.id,first.id);assert.equal(jwt.decode(r.data.accessToken).normalSessionId,jwt.decode(firstSession.accessToken).normalSessionId);firstSession=r.data;
    const grantless=jwt.sign({username:first.username,role:'personel'},env.auth.jwtSecret,{subject:first.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'1m'});assert.equal((await f.call('/auth/me',{token:grantless})).status,401);
  });
  await t.test('manager assigns only new synthetic customer; assigned person sees exact persisted row and wrong person is denied',async()=>{
    let r=await f.call('/crm/inbox',{token:firstSession.accessToken});assert.equal(r.status,200);assert.equal(r.data.conversations.length,0);
    r=await f.call('/crm/conversations/155/assign',{token:leader.session.accessToken,body:{agentId:1001}});assert.equal(r.status,200);assert.equal(r.data.confirmed,true);
    r=await f.call('/crm/inbox',{token:firstSession.accessToken});assert.equal(r.status,200);assert.deepEqual(r.data.conversations.map(row=>row.id),['155']);assert.equal(r.data.summary.total,1);assert.equal(r.data.capabilities.assign,false);
    const detail=await f.call('/crm/conversations/155',{token:firstSession.accessToken});assert.equal(detail.status,200);assert.equal(String(detail.data.id),'155');assert.equal(detail.data.canSend,false);assert.equal(detail.data.canAssign,false);
    assert.equal((await f.call('/crm/conversations/156',{token:firstSession.accessToken})).status,403);assert.equal((await f.call('/crm/conversations/155',{token:baselineStaff.accessToken})).status,403);
    const all=await f.call('/crm/inbox',{token:leader.session.accessToken});assert.equal(all.data.summary.total,4);assert.equal(all.data.summary.unassigned,1);assert.equal(all.data.conversations.find(row=>row.id==='55').canAssign,false);assert.equal(all.data.conversations.find(row=>row.id==='155').canAssign,true);
    const unassigned=all.data.conversations.find(row=>row.id==='156');assert.equal(unassigned.assignedUserId,null);assert.equal(unassigned.assignedUserName,'');assert.equal(unassigned.chatwootAgentId,null);
    const mapping=(await inventory(manager.accessToken)).assignments.find(row=>row.conversationId==='155');assert.deepEqual(mapping.accountIds,[first.id]);
  });
  await t.test('no baseline assignment, provider/message write, normal account adoption or personel escalation route opens',async()=>{
    for(const route of ['/crm/conversations/55/assign','/crm/conversations/56/assign','/crm/conversations/155/messages','/crm/conversations/155/translate'])assert.equal((await f.call(route,{token:manager.accessToken,body:{agentId:1001,text:'synthetic'}})).status,403);
    assert.equal((await f.call('/crm/conversations/155/assign',{token:firstSession.accessToken,body:{agentId:1002}})).status,403);
    assert.equal((await f.call('/crm/users/clean-semih-20261023',{method:'PATCH',token:manager.accessToken,body:await body()})).status,403);
    assert.equal((await f.call('/crm/users',{token:manager.accessToken,body:await body({role:'patron'})})).status,400);
    for(const change of [{username:first.username,chatwootAgentId:1004},{username:'another',chatwootAgentId:1001}])assert.equal((await f.call('/crm/users',{token:manager.accessToken,body:await body(change)})).status,409);
  });
  await t.test('an unlinked normal personnel account cannot list or open unassigned synthetic customers',async()=>{
    const account={...env.auth.users[1],id:'unlinked-fixture',username:'unlinked-fixture',chatwootAgentId:null};env.auth.users.push(account);
    try{
      const signed=await login(account.username),inbox=await f.call('/crm/inbox',{token:signed.accessToken});assert.equal(inbox.status,200);assert.equal(inbox.data.conversations.length,0);
      assert.equal((await f.call('/crm/conversations/156',{token:signed.accessToken})).status,403);
    }finally{env.auth.users.pop();}
  });
  await t.test('normal role change invalidates old JWT and refresh, new normal login gets manager scope then cannot revive old family',async()=>{
    let edit=await body({username:first.username,displayName:first.displayName,role:'mudur',chatwootAgentId:1001});delete edit.password;
    assert.equal((await f.call('/crm/users/'+first.id,{method:'PATCH',token:manager.accessToken,body:edit})).status,200);
    assert.equal((await f.call('/auth/me',{token:firstSession.accessToken})).status,401);assert.equal((await f.call('/auth/refresh',{body:{refreshToken:firstSession.refreshToken}})).status,401);
    const promoted=await login(first.username,firstBody.password);assert.equal(promoted.user.role,'mudur');assert.equal((await inventory(promoted.accessToken)).accounts.length,7);
    edit=await body({username:first.username,displayName:first.displayName,role:'personel',chatwootAgentId:1001});delete edit.password;assert.equal((await f.call('/crm/users/'+first.id,{method:'PATCH',token:manager.accessToken,body:edit})).status,200);
    assert.equal((await f.call('/auth/me',{token:promoted.accessToken})).status,401);assert.equal((await f.call('/auth/me',{token:firstSession.accessToken})).status,401);firstSession=await login(first.username,firstBody.password);
  });
  await t.test('deactivation/re-enable, explicit agent/password change and logout close prior session; audit never exposes credential',async()=>{
    const before=firstSession;
    for(const active of [false,true]){const edit=await body({username:first.username,displayName:first.displayName,active,chatwootAgentId:1001});delete edit.password;assert.equal((await f.call('/crm/users/'+first.id,{method:'PATCH',token:manager.accessToken,body:edit})).status,200);assert.equal((await f.call('/auth/me',{token:before.accessToken})).status,401);}
    firstSession=await login(first.username,firstBody.password);
    const updated=await body({username:first.username,displayName:first.displayName,chatwootAgentId:1004});assert.equal((await f.call('/crm/users/'+first.id,{method:'PATCH',token:manager.accessToken,body:updated})).status,200);
    assert.equal((await f.call('/auth/me',{token:firstSession.accessToken})).status,401);assert.equal((await f.call('/auth/login',{body:{username:first.username,password:firstBody.password}})).status,401);
    const fresh=await login(first.username,updated.password);assert.equal((await f.call('/crm/inbox',{token:fresh.accessToken})).data.conversations.length,0);
    assert.equal((await f.call('/auth/logout',{token:fresh.accessToken,body:{}})).status,200);assert.equal((await f.call('/auth/me',{token:fresh.accessToken})).status,401);assert.equal((await f.call('/auth/refresh',{body:{refreshToken:fresh.refreshToken}})).status,401);
    const raw=f.memory.text(CLEAN_MANAGED_USERS_FILE),disk=JSON.parse(raw);assert(!raw.includes(firstBody.password));assert(!raw.includes(updated.password));assert(!raw.includes(fresh.accessToken));assert(!JSON.stringify(disk.audit).includes('scrypt$'));assert.equal(disk.audit.length,disk.revision);assert.equal(JSON.stringify(env.auth.users),f.baseline);
  });
  await t.test('profile/permission changes are fresh, not cached; missing or wrong environment cannot keep using management',async()=>{
    process.env.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED='false';assert.equal((await f.call('/crm/users',{token:manager.accessToken})).status,503);process.env.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED='true';
    assert.equal((await inventory(manager.accessToken)).accounts.length,7);
  });
});
