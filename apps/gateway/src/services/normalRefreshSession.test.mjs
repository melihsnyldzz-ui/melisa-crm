import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNormalRefreshStore,configuredNormalRefreshStore,isDedicatedNormalTestUser} from './normalRefreshSession.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'melisa-normal-refresh-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=100000;
 const user={id:'test-personel',username:'agent-test',role:'personel',active:true,chatwootAgentId:3,permissions:['crm.view'],passwordHash:'offline-hash'};
 const file=path.join(dir,'journal.json'),resolveUser=id=>id===user.id?user:null;
 return {user,file,resolveUser,advance:value=>now+=value,store:createNormalRefreshStore({file,resolveUser,now:()=>now})};}
test('normal refresh survives a restart; disk holds hashes only and preserves role/assignment',t=>{const f=fixture(t),issued=f.store.issue(f.user);const text=fs.readFileSync(f.file,'utf8');assert(!text.includes(issued.refreshToken));assert(!text.includes(f.user.passwordHash));assert(!text.includes('accessToken'));
 const restarted=createNormalRefreshStore({file:f.file,resolveUser:f.resolveUser,now:()=>100000});const next=restarted.rotate(issued.refreshToken);assert.equal(next.sid,issued.sid);assert.equal(next.user.chatwootAgentId,3);assert.deepEqual(next.user.permissions,['crm.view']);assert.notEqual(next.refreshToken,issued.refreshToken);assert.throws(()=>f.store.rotate(issued.refreshToken),{statusCode:401});assert.equal(restarted.verify(next.sid,f.user),f.user);});
test('logout revokes both refresh and the session ID used by already-issued JWTs',t=>{const f=fixture(t),g=f.store.issue(f.user);f.store.revoke(g.refreshToken);assert.throws(()=>f.store.verify(g.sid,f.user),{statusCode:401});assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:401});assert.deepEqual(f.store.revoke(g.refreshToken),{loggedOut:true});});
test('logout using a token retired by a concurrent refresh revokes its whole family but replay cannot rotate',t=>{const f=fixture(t),old=f.store.issue(f.user),fresh=f.store.rotate(old.refreshToken);assert.throws(()=>f.store.rotate(old.refreshToken),{statusCode:401});f.store.revoke(old.refreshToken);assert.throws(()=>f.store.verify(old.sid,f.user),{statusCode:401});assert.throws(()=>f.store.rotate(fresh.refreshToken),{statusCode:401});const text=fs.readFileSync(f.file,'utf8');assert(!text.includes(old.refreshToken));assert(!text.includes(fresh.refreshToken));});
test('password, role, assignment, permission and active changes each fail closed',t=>{for(const [key,value] of [['passwordHash','new-hash'],['role','mudur'],['chatwootAgentId',4],['permissions',['crm.view','crm.send']],['active',false]]){const f=fixture(t),g=f.store.issue(f.user);f.user[key]=value;assert.throws(()=>f.store.verify(g.sid,f.user),{statusCode:401});assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:401});}});
test('expired grant and malformed/reused tokens are rejected without changing the journal',t=>{const f=fixture(t),g=f.store.issue(f.user);f.advance(30*86400000);const before=fs.readFileSync(f.file,'utf8');assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:401});assert.throws(()=>f.store.rotate('bogus'),{statusCode:401});assert.equal(fs.readFileSync(f.file,'utf8'),before);});
test('concurrent writer lock and corrupt journal never overwrite valid state',t=>{const f=fixture(t),g=f.store.issue(f.user),before=fs.readFileSync(f.file,'utf8');fs.writeFileSync(`${f.file}.lock`,'fixture');assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:503});assert.equal(fs.readFileSync(f.file,'utf8'),before);fs.unlinkSync(`${f.file}.lock`);fs.writeFileSync(f.file,'bad');assert.throws(()=>f.store.issue(f.user),{statusCode:401});assert.equal(fs.readFileSync(f.file,'utf8'),'bad');});
test('normal feature is disabled by default; enabled requires isolated DB02 and private path',()=>{assert.equal(configuredNormalRefreshStore({config:{}}),null);assert.throws(()=>configuredNormalRefreshStore({config:{CRM_NORMAL_REFRESH_ENABLED:'true'}}));assert.throws(()=>configuredNormalRefreshStore({config:{CRM_NORMAL_REFRESH_ENABLED:'true',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'OTHER',CRM_NORMAL_REFRESH_USER_ID:'agent',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/test/journal.json'}}));});
test('enabled normal refresh rejects shared or admin IDs at startup, even in the correct private DB02 scope',()=>{
 const config={CRM_NORMAL_REFRESH_ENABLED:'true',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/test/journal.json'};
 for(const id of ['crm-ahmet','crm-personel-3','admin',''])assert.throws(()=>configuredNormalRefreshStore({config:{...config,CRM_NORMAL_REFRESH_USER_ID:id},resolveUser:()=>null,repoRoot:'C:/Sirket/CRM/melisa-crm'}));
 assert(configuredNormalRefreshStore({config:{...config,CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011'},resolveUser:()=>null,repoRoot:'C:/Sirket/CRM/melisa-crm'}));
});
test('dedicated identity policy rejects changed username, role, assignment or send permissions before issuing a grant',t=>{
 const f=fixture(t);Object.assign(f.user,{id:'crm-agent-test-20261011',username:'crm-agent-test'});
 const store=createNormalRefreshStore({file:f.file,resolveUser:f.resolveUser,authorizeUser:isDedicatedNormalTestUser,now:()=>100000});
 const original={...f.user,permissions:[...f.user.permissions]};
 for(const [key,value] of [['username','crm-ahmet'],['role','mudur'],['chatwootAgentId',4],['permissions',['crm.view','crm.send']],['testPersonnel',true]]){
  Object.assign(f.user,original);delete f.user.testPersonnel;f.user[key]=value;assert.throws(()=>store.issue(f.user),{statusCode:401});assert(!fs.existsSync(f.file));
 }
 Object.assign(f.user,original);delete f.user.testPersonnel;const issued=store.issue(f.user);f.user.role='mudur';const before=fs.readFileSync(f.file,'utf8');assert.throws(()=>store.rotate(issued.refreshToken),{statusCode:401});assert.throws(()=>store.verify(issued.sid,f.user),{statusCode:401});assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
