import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalSessionLoader} from '../src/sessionLoader.js';

const location={origin:'http://127.0.0.1:62800',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5244'};
const id='clean-managed-a1000001-0000-4000-8000-000000000001';
const permissions={personel:['crm.view','crm.send'],mudur:['crm.view','crm.send','crm.assign','crm.agents','crm.manage']};
const actor=role=>({id,username:'synthetic-personal-'+role,role,chatwootAgentId:1001,permissions:[...permissions[role]],normalRefreshSession:true,canAssign:role==='mudur'});
const relation=()=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',erpOrigin:'http://127.0.0.1:5244',crmOrigin:location.origin,erpUserId:71001,erpNormalSessionId:'a1000002-0000-4000-8000-000000000002',crmUserId:id,chatwootAgentId:1001,bindingRevision:'b'.repeat(64),expiresAt:10000});
const assigned={id:'155',assignedUserId:id,chatwootAgentId:1001};
const other={id:'156',assignedUserId:'synthetic-other-person',chatwootAgentId:1002};
const unassigned={id:'157',assignedUserId:null,chatwootAgentId:null};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function fixture(role='mudur'){
  let user=actor(role),binding=relation(),rows=role==='mudur'?[assigned,other,unassigned]:[assigned],sessionError=null,inboxWait=null,serial=0;
  const commits=[],errors=[],closed=[],calls=[],inboxEntered=deferred();
  const api={
    resumeNormalSession:async()=>({accessToken:'synthetic-linked-'+(++serial),user}),
    session:async()=>{calls.push('me');if(sessionError)throw sessionError;return {...user,terminalIdentity:{...binding}};},
    inbox:async()=>{calls.push('inbox');inboxEntered.resolve();if(inboxWait)await inboxWait;return {conversations:rows,summary:{total:rows.length}};},
    agents:async()=>({agents:[{id:1001,name:'Synthetic personal'},{id:1002,name:'Synthetic other'}]}),
    rememberNormalSession:async()=>{},
    clearNormalSession:async key=>{closed.push(key);},
  };
  const loader=createTerminalSessionLoader({api,location,now:()=>1000,onCommit:value=>commits.push(value),onError:error=>errors.push(error),onInvalidate:()=>calls.push('invalidate'),onBusy:()=>{}});
  return {loader,commits,errors,closed,calls,inboxEntered:inboxEntered.promise,setRows:value=>{rows=value;},setUser:value=>{user=value;},setBinding:value=>{binding=value;},deny:()=>{sessionError=Object.assign(Error('synthetic current authority revoked'),{status:403});},waitInbox:promise=>{inboxWait=promise;}};
}

test('B5 managed personal Personel opens its explicit ERP identity and only its assigned conversation',async()=>{
  const f=fixture('personel'),opened=await f.loader.start();
  assert(opened);assert.equal(opened.session.id,id);assert.equal(opened.session.role,'personel');
  assert.deepEqual(opened.inbox.conversations,[assigned]);assert.equal(f.commits.length,1);assert.equal(f.closed.length,0);
  await f.loader.close();
});

test('B5 managed personal Mudur keeps its own linked identity while reading other and unassigned conversations',async()=>{
  const f=fixture(),opened=await f.loader.start();
  assert(opened);assert.equal(opened.session.id,id);assert.equal(opened.session.role,'mudur');
  assert.deepEqual(opened.inbox.conversations,[assigned,other,unassigned]);assert.equal(f.commits.length,1);
  assert(f.calls.filter(x=>x==='me').length>=2);assert.equal(f.closed.length,0);
  await f.loader.verifySession(opened.key);await f.loader.close();assert.deepEqual(f.closed,[opened.key]);
});

test('B5 personal manager support does not relax Personel ownership, unknown roles, or complete manager authority',async()=>{
  const wrong=fixture('personel');wrong.setRows([other]);assert.equal(await wrong.loader.start(),null);assert.equal(wrong.commits.length,0);
  for(const change of [{role:'patron'},{role:'finance'},{normalRefreshSession:false},{testAdmin:true},{testPersonnel:true},{permissions:['crm.view','crm.send']},{permissions:[...permissions.mudur,'unknown.permission']},{permissions:['crm.view','crm.send','crm.assign','crm.agents','crm.agents']}]){
    const f=fixture();f.setUser({...actor('mudur'),...change});assert.equal(await f.loader.start(),null);assert.equal(f.commits.length,0);assert(!f.calls.includes('inbox'));
  }
});

test('B5 a linked personal role cannot silently change during its pending inbox read',async()=>{
  const f=fixture('personel'),pending=deferred();f.waitInbox(pending.promise);
  const start=f.loader.start();await Promise.race([f.inboxEntered,start.then(()=>{throw Error('Personel rejected before inbox');})]);
  f.setUser(actor('mudur'));pending.resolve();assert.equal(await start,null);assert.equal(f.commits.length,0);assert.equal(f.closed.length,1);
});

test('B5 current ERP revoke hides a linked Mudur and closes only its own normal family',async()=>{
  const f=fixture(),opened=await f.loader.start();assert(opened);f.deny();
  await assert.rejects(()=>f.loader.verifySession(opened.key),{status:403});
  assert.deepEqual(f.closed,[opened.key]);assert(f.calls.includes('invalidate'));
});

test('B5 personal Mudur binding change cannot publish a pending global inbox',async()=>{
  const f=fixture(),pending=deferred();f.waitInbox(pending.promise);const start=f.loader.start();
  // A failed early authority check must fail this test instead of hanging.
  await Promise.race([f.inboxEntered,start.then(()=>{throw Error('Manager rejected before inbox');})]);
  f.setBinding({...relation(),erpUserId:71002});pending.resolve();assert.equal(await start,null);assert.equal(f.commits.length,0);assert.equal(f.closed.length,1);
});
