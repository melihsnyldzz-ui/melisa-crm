import test from 'node:test';
import assert from 'node:assert/strict';
import {installTestAdminSession,verifyTestAdminSession} from './testAdminSession.mjs';
import {installTestPersonnelSession,verifyTestPersonnelSession} from './testPersonnelSession.mjs';
const exact={uiOrigin:'http://127.0.0.1:62700',gatewayOrigin:'http://127.0.0.1:62701'};
test('DB02 process-local admin session accepts exact pair and cannot reuse old copy token or accept cross origins',()=>{
 const old=installTestAdminSession({uiOrigin:'http://127.0.0.1:62600',gatewayOrigin:'http://127.0.0.1:62601'})().accessToken;
 const issue=installTestAdminSession(exact);assert.equal(verifyTestAdminSession(old),null);assert.equal(verifyTestAdminSession(issue().accessToken).testAdmin,true);
 for(const change of [{gatewayOrigin:'http://127.0.0.1:62601'},{uiOrigin:'http://192.168.1.46:62700'},{gatewayOrigin:'http://localhost:62701'},{uiOrigin:'http://127.0.0.1:62710'}])assert.throws(()=>installTestAdminSession({...exact,...change}),/TEST_ADMIN_ORIGIN_REQUIRED/);
});
test('DB02 personnel session retains existing exact actor assignment scope and revoked identity fails closed',()=>{
 const actor={id:'synthetic-staff',username:'crm-ahmet',active:true,role:'personel',chatwootAgentId:1,permissions:['crm.view','crm.send']};let current=actor;const resolveUser=()=>current;
 const issue=installTestPersonnelSession({...exact,username:actor.username,resolveUser}),token=issue().accessToken,user=verifyTestPersonnelSession(token);assert.equal(user.testPersonnel,true);assert.deepEqual(user.permissions,['crm.view','crm.send']);
 assert.throws(()=>installTestPersonnelSession({...exact,gatewayOrigin:'http://127.0.0.1:62601',username:actor.username,resolveUser}),/TEST_PERSONNEL_ORIGIN_REQUIRED/);
 current={...actor,chatwootAgentId:2};assert.equal(verifyTestPersonnelSession(token),null);assert.throws(()=>issue(),/TEST_PERSONNEL_IDENTITY_REQUIRED/);
});
