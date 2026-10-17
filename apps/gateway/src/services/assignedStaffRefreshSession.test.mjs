import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNormalRefreshStore} from './normalRefreshSession.mjs';
import {DEDICATED_ASSIGNED_STAFF_TEST_USER_ID,ASSIGNED_STAFF_REFRESH_JOURNAL,isDedicatedAssignedStaffTestUser,
  assignedStaffRefreshUserPolicy,configuredAssignedStaffRefreshStore} from './assignedStaffRefreshSession.mjs';

const config=()=>({CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'true',CRM_ASSIGNED_STAFF_REFRESH_USER_ID:DEDICATED_ASSIGNED_STAFF_TEST_USER_ID,
  CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL,CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'true',
  CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_ISOLATED_PREPARATION:'true',
  CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_UI_ORIGIN:'http://127.0.0.1:62700',
  CRM_TEST_PORT_BASE:'62700',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',WHATSAPP_SEND_ENABLED:'false',
  WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',CRM_NORMAL_REFRESH_ENABLED:'true',
  CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/offline-staff-policy/old.json',
  CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:'C:/Sirket/CRM/runtime/offline-staff-policy/interest.json',
  CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/offline-staff-policy/issuer.json'});
const actor=()=>({id:DEDICATED_ASSIGNED_STAFF_TEST_USER_ID,username:'crm-crm06-staff',role:'personel',active:true,
  chatwootAgentId:2,permissions:['crm.view'],passwordHash:'synthetic-unit-hash'});
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-assigned-staff-policy-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const user=actor(),cfg=config(),file=path.join(dir,'staff.json');
  const resolveUser=id=>id===user.id?user:null;
  const store=()=>createNormalRefreshStore({file,resolveUser,authorizeUser:assignedStaffRefreshUserPolicy(cfg)});
  return {dir,user,cfg,file,store:store(),restart:store};
}

test('assigned staff is default-off and finite scope does not accept a replacement profile or broader permission',()=>{
  assert.equal(configuredAssignedStaffRefreshStore({config:{}}),null);
  const user=actor();assert(isDedicatedAssignedStaffTestUser(user));
  for(const change of [{id:'crm-agent-test-20261011'},{id:'manager'},{username:'other'},{role:'mudur'},{active:false},
    {chatwootAgentId:3},{permissions:['crm.view','crm.send']},{permissions:[]},{testAdmin:true},{testPersonnel:true}])
    assert.equal(isDedicatedAssignedStaffTestUser({...user,...change}),false);
});

test('assigned staff policy rejects LIVE, send/AI, proof/Semih, origin/old-profile drift and journal reuse',()=>{
  const cfg=config();assert(assignedStaffRefreshUserPolicy(cfg)(actor()));
  for(const change of [{CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'false'},{CRM_ASSIGNED_STAFF_REFRESH_USER_ID:'other'},
    {CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false'},{CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true'},{CRM_SEMIH_TEST_CONTINUE_ENABLED:'true'},
    {CRM_ISOLATED_PREPARATION:'false'},{CRM_TEST_EXPECTED_DATABASE:'LIVE'},{CRM_UI_ORIGIN:'http://127.0.0.1:62800'},
    {CRM_TEST_PORT_BASE:'62800'},{CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4185'},{WHATSAPP_SEND_ENABLED:'true'},
    {WHATSAPP_LIVE_SEND_APPROVED:'true'},{CRM_PAID_AI_ENABLED:'true'},{CRM_NORMAL_REFRESH_ENABLED:'false'},
    {CRM_NORMAL_REFRESH_USER_ID:DEDICATED_ASSIGNED_STAFF_TEST_USER_ID},{CRM_NORMAL_REFRESH_JOURNAL_PATH:''},
    {CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/another.json'},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL.toUpperCase()},
    {CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL},
    {CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:ASSIGNED_STAFF_REFRESH_JOURNAL},
    {CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL+'.'},
    {CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL+' '},
    {CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:ASSIGNED_STAFF_REFRESH_JOURNAL.replace('/CRM06-TEST-ACTORS-20261014/','/CRM06-TEST-ACTORS-20261014./')},
    {CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:ASSIGNED_STAFF_REFRESH_JOURNAL+':stream'}])
    assert.throws(()=>assignedStaffRefreshUserPolicy({...cfg,...change}));
});

test('assigned staff factory requires an existing exact actor and canonical private Windows scope without writing at startup',()=>{
  const cfg=config();
  for(const user of [null,{...actor(),role:'mudur'},{...actor(),chatwootAgentId:3}])
    assert.throws(()=>configuredAssignedStaffRefreshStore({config:cfg,resolveUser:()=>user,repoRoot:'C:/Sirket/CRM/melisa-crm'}));
  const supported=()=>configuredAssignedStaffRefreshStore({config:cfg,resolveUser:()=>actor(),repoRoot:'C:/Sirket/CRM/melisa-crm'});
  if(process.platform==='win32')assert(supported());else assert.throws(supported);
});

test('new assigned staff grant rotates across an engine reopen without touching separate old/issuer family files',t=>{
  const f=fixture(t),old=path.join(f.dir,'old.json'),issuer=path.join(f.dir,'issuer.json');
  fs.writeFileSync(old,'synthetic-existing-agent3-bytes');fs.writeFileSync(issuer,'synthetic-existing-issuer-bytes');
  const issued=f.store.issue(f.user),text=fs.readFileSync(f.file,'utf8');
  assert(!text.includes(issued.refreshToken));assert(!text.includes(f.user.passwordHash));
  const reopened=f.restart(),fresh=reopened.rotate(issued.refreshToken);
  assert.equal(fresh.sid,issued.sid);assert.equal(fresh.user.chatwootAgentId,2);assert.deepEqual(fresh.user.permissions,['crm.view']);
  assert.throws(()=>reopened.rotate(issued.refreshToken),{statusCode:401});
  assert.equal(fs.readFileSync(old,'utf8'),'synthetic-existing-agent3-bytes');assert.equal(fs.readFileSync(issuer,'utf8'),'synthetic-existing-issuer-bytes');
  const second=reopened.issue(f.user);reopened.revokeSession(issued.sid,f.user);
  assert.throws(()=>reopened.verify(issued.sid,f.user),{statusCode:401});assert.equal(reopened.verify(second.sid,f.user).id,f.user.id);
});

test('assigned staff operations recheck role, assignment, password and configuration after a grant is issued',t=>{
  for(const change of [{role:'mudur'},{chatwootAgentId:3},{active:false},{permissions:['crm.view','crm.send']},{passwordHash:'changed'}]){
    const f=fixture(t),g=f.store.issue(f.user),before=fs.readFileSync(f.file,'utf8');Object.assign(f.user,change);
    assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:401});assert.throws(()=>f.store.verify(g.sid,f.user),{statusCode:401});
    assert.equal(fs.readFileSync(f.file,'utf8'),before);
  }
  const f=fixture(t),g=f.store.issue(f.user);f.cfg.CRM_ASSIGNED_STAFF_REFRESH_ENABLED='false';
  assert.throws(()=>f.store.rotate(g.refreshToken),{statusCode:401});assert.throws(()=>f.store.verify(g.sid,f.user),{statusCode:401});
});
