import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {createCleanCrmManagementStore,configuredCleanCrmManagement,CLEAN_MANAGED_USERS_FILE} from './cleanCrmManagement.mjs';
import {createNormalRefreshStore,normalSessionFingerprint} from './normalRefreshSession.mjs';

const hashPassword=value=>{const salt=crypto.randomBytes(24).toString('hex');return `scrypt$${salt}$${crypto.scryptSync(value,salt,64).toString('hex')}`;};
function fixture(t){
  const base=fileURLToPath(new URL('../../../frontend/.sites-runtime/',import.meta.url));fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'crm-managed-offline-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const actor={id:'baseline-manager',username:'baseline-manager',displayName:'Örnek Yönetici',role:'patron',active:true,chatwootAgentId:1,passwordHash:hashPassword(crypto.randomBytes(24).toString('base64url'))};
  const baseline=[actor,{...actor,id:'baseline-staff',username:'baseline-staff',role:'personel',chatwootAgentId:2}];
  const file=path.join(dir,'users.json'),baselineText=JSON.stringify(baseline);let enabled=true;
  const options={file,baseline:()=>baseline,enabled:()=>enabled};
  const store=createCleanCrmManagementStore(options);
  const body=(change={})=>({revision:store.overview().revision,username:'sentetik-a',displayName:'Sentetik Personel A',role:'personel',active:true,chatwootAgentId:1001,password:crypto.randomBytes(24).toString('base64url'),...change});
  return {dir,actor,baseline,file,baselineText,store,options,body,disable:()=>{enabled=false;}};
}

test('managed personal accounts persist with stable IDs, unique explicit agent and audited normal role; baseline untouched',t=>{
  const f=fixture(t),body=f.body(),made=f.store.create(f.actor,body,hashPassword),reopened=createCleanCrmManagementStore(f.options);
  assert.match(made.account.id,/^clean-managed-/);assert.equal(made.revision,1);assert(!Object.hasOwn(made.account,'passwordHash'));
  const records=reopened.records();assert.equal(records[0].id,made.account.id);assert.equal(records[0].role,'personel');assert.equal(records[0].chatwootAgentId,1001);assert.equal(records[0].managementRevision,1);
  const disk=JSON.parse(fs.readFileSync(f.file,'utf8'));assert(!fs.readFileSync(f.file,'utf8').includes(body.password));assert.equal(disk.audit[0].actorId,f.actor.id);assert.equal(disk.audit[0].action,'create-account');
  assert(!JSON.stringify(disk.audit).includes(records[0].passwordHash));assert(!JSON.stringify(disk.audit).includes('accessToken'));assert.equal(JSON.stringify(f.baseline),f.baselineText);
});

test('inactive usernames and agent IDs remain reserved, protected baseline cannot be changed or adopted',t=>{
  const f=fixture(t),a=f.store.create(f.actor,f.body({active:false}),hashPassword),before=fs.readFileSync(f.file,'utf8');
  for(const change of [{username:'SENTETİK-A',chatwootAgentId:1002},{username:'other-agent',chatwootAgentId:1001},{username:'baseline-manager',chatwootAgentId:1002}])assert.throws(()=>f.store.create(f.actor,f.body(change),hashPassword),{statusCode:409});
  assert.throws(()=>f.store.update(f.actor,f.actor.id,f.body({password:undefined}),hashPassword),{statusCode:400});
  assert.throws(()=>f.store.update(f.actor,f.actor.id,f.body(),hashPassword),{statusCode:403});
  assert.equal(fs.readFileSync(f.file,'utf8'),before);assert.equal(a.account.active,false);
});

test('invalid role/field/target/agent/password and stale revision fail without creating state',t=>{
  const f=fixture(t);
  for(const change of [{role:'patron'},{role:'admin'},{chatwootAgentId:2},{chatwootAgentId:'1001'},{chatwootAgentId:10000},{active:'true'},{id:'picked-id'},{username:'x'},{displayName:'\u202eName'},{password:'short'},{password:'x'.repeat(257)}])assert.throws(()=>f.store.create(f.actor,f.body(change),hashPassword),{statusCode:400});
  assert(!fs.existsSync(f.file));f.store.create(f.actor,f.body(),hashPassword);const before=fs.readFileSync(f.file,'utf8');
  assert.throws(()=>f.store.create(f.actor,f.body({username:'sentetik-b',chatwootAgentId:1002,revision:0}),hashPassword),{statusCode:409});assert.equal(fs.readFileSync(f.file,'utf8'),before);
});

test('normal grant engine rejects old access/refresh after role, agent, password or active flip-back by server revision',t=>{
  const f=fixture(t),made=f.store.create(f.actor,f.body(),hashPassword);
  const current=()=>({...f.store.records()[0],permissions:f.store.records()[0].role==='mudur'?['crm.view','crm.send','crm.assign','crm.agents','crm.manage']:['crm.view','crm.send']});
  const normal=createNormalRefreshStore({file:path.join(f.dir,'normal.json'),resolveUser:()=>current(),authorizeUser:user=>f.store.isManaged(user)});
  for(const change of [{role:'mudur'},{chatwootAgentId:1002},{password:crypto.randomBytes(24).toString('base64url')},{active:false}]){
    const original=current(),grant=normal.issue(original),fingerprint=normalSessionFingerprint(original);
    const body=f.body({...original,...change});delete body.id;delete body.passwordHash;delete body.managementRevision;delete body.permissions;
    f.store.update(f.actor,made.account.id,body,hashPassword);
    assert.notEqual(normalSessionFingerprint(current()),fingerprint);assert.throws(()=>normal.verify(grant.sid,current()),{statusCode:401});assert.throws(()=>normal.rotate(grant.refreshToken),{statusCode:401});
    const restore=f.body({username:original.username,displayName:original.displayName,role:original.role,active:true,chatwootAgentId:original.chatwootAgentId});delete restore.password;
    f.store.update(f.actor,made.account.id,restore,hashPassword);assert.throws(()=>normal.verify(grant.sid,current()),{statusCode:401});
  }
});

test('only fresh normal managers mutate; disabled profile, impersonated management flags and wrong roles cannot',t=>{
  const f=fixture(t);
  for(const actor of [null,{...f.actor,role:'personel'},{...f.actor,active:false},{...f.actor,testAdmin:true},{...f.actor,testPersonnel:true},{...f.actor,passwordHash:'copied'},{...f.actor,id:'unknown'}])assert.throws(()=>f.store.create(actor,f.body(),hashPassword),{statusCode:403});
  assert(!fs.existsSync(f.file));f.disable();assert.throws(()=>f.store.records(),{statusCode:503});assert.throws(()=>f.store.create(f.actor,f.body(),hashPassword),{statusCode:503});
});

test('assignment is persisted only for separate synthetic slots; baseline and inactive/unmapped agents stay protected',t=>{
  const f=fixture(t),a=f.store.create(f.actor,f.body(),hashPassword),before=fs.readFileSync(f.file,'utf8');
  for(const [id,agent]of [['55',1001],['56',1001],['155',2],['155',1002],['155','1001']])assert.throws(()=>f.store.assign(f.actor,id,agent));
  assert.equal(fs.readFileSync(f.file,'utf8'),before);const result=f.store.assign(f.actor,'155',1001);assert.equal(result.confirmed,true);assert.equal(result.source,'clean-synthetic-management');
  const reopened=createCleanCrmManagementStore(f.options);assert.equal(reopened.conversations()[0].assigneeAgentId,1001);const state=fs.readFileSync(f.file,'utf8');f.store.assign(f.actor,'155',1001);assert.equal(fs.readFileSync(f.file,'utf8'),state);
  f.store.update(f.actor,a.account.id,f.body({active:false}),hashPassword);assert.throws(()=>f.store.assign(f.actor,'156',1001),{statusCode:400});f.store.assign(f.actor,'155',null);assert.equal(f.store.conversations()[0].assigneeAgentId,null);
});

test('corrupt state, lock collision, link metadata and failed atomic replacement preserve the original state',t=>{
  const f=fixture(t);f.store.create(f.actor,f.body(),hashPassword);const before=fs.readFileSync(f.file,'utf8');
  fs.writeFileSync(`${f.file}.lock`,'held');assert.throws(()=>f.store.create(f.actor,f.body({username:'sentetik-b',chatwootAgentId:1002}),hashPassword),{statusCode:503});assert.equal(fs.readFileSync(f.file,'utf8'),before);fs.unlinkSync(`${f.file}.lock`);
  const original=fs.renameSync;t.mock.method(fs,'renameSync',(from,to)=>{if(to===f.file)throw Error('synthetic replacement failure');return original(from,to);});
  assert.throws(()=>f.store.create(f.actor,f.body({username:'sentetik-b',chatwootAgentId:1002}),hashPassword),{statusCode:503});assert.equal(fs.readFileSync(f.file,'utf8'),before);assert.deepEqual(fs.readdirSync(f.dir),['users.json']);t.mock.restoreAll();
  const stat=fs.lstatSync;
  for(const info of [{isSymbolicLink:()=>true},{nlink:2}]){
    t.mock.method(fs,'lstatSync',(target,...args)=>{const result=stat(target,...args);return path.resolve(target)===f.file?Object.assign(result,info):result;});
    assert.throws(()=>f.store.records(),{statusCode:503});assert.equal(fs.readFileSync(f.file,'utf8'),before);t.mock.restoreAll();
  }
  fs.writeFileSync(f.file,'bad');assert.throws(()=>f.store.records(),{statusCode:503});assert.equal(fs.readFileSync(f.file,'utf8'),'bad');
});

test('management is default off; exact protected path, clean database and explicit disabled side effects required',()=>{
  assert.equal(configuredCleanCrmManagement({config:{}}),null);
  const enabled={CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED:'true',CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:CLEAN_MANAGED_USERS_FILE};
  for(const config of [enabled,{...enabled,CRM_TEST_PROFILE:'clean-synthetic-20261022'},{...enabled,CRM_TEST_PROFILE:'live'},{...enabled,CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:'C:/arbitrary.json'}])assert.throws(()=>configuredCleanCrmManagement({config,baseline:()=>[]}));
});
