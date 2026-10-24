import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../app.js';
import {env} from '../config/env.js';
import {createPasswordHash} from '../services/crmAuthService.js';

test('B5 normal management reads all configured CRM accounts without changing identities', async t => {
  const previousAuth = {...env.auth};
  const keys = ['CRM_TEST_PROFILE','CRM_ISOLATED_PREPARATION','CRM_TEST_PORT_BASE','CRM_TEST_ERP_ORIGIN','CRM_TEST_EXPECTED_DATABASE','CRM_CLEAN_CONVERSATION_PROJECTION_JSON'];
  const previous = Object.fromEntries(keys.map(key => [key,process.env[key]]));
  Object.assign(process.env, {
    CRM_TEST_PROFILE:'clean-synthetic-20261022', CRM_ISOLATED_PREPARATION:'true',
    CRM_TEST_PORT_BASE:'62800', CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',
    CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',
    CRM_CLEAN_CONVERSATION_PROJECTION_JSON:JSON.stringify({version:1,synthetic:true,environment:'CLEAN_SYNTHETIC_TEST',environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',conversations:[{id:'55',phone:'905550000001',name:'Örnek mağaza',assigneeAgentId:2}]}),
  });
  const password = 'B5-local-fixture-password';
  const passwordHash = createPasswordHash(password,'B5-local-fixture-salt');
  const account = (id,role,agent,active=true) => ({id,username:id,displayName:id,role,active,chatwootAgentId:agent,passwordHash,password:'not-public',privateNote:'not-public'});
  env.auth.users = [account('manager','mudur',1),account('staff','personel',2),account('unlinked','personel',null),account('disabled','personel',3,false),account('owner','patron',null)];
  Object.assign(env.auth,{jwtSecret:'B5-offline-fixture-signing-key-for-normal-auth',issuer:'b5-offline',audience:'b5-offline-client',personnelCanSend:false});
  const baseline = JSON.stringify(env.auth.users);
  const server = createApp().listen(0,'127.0.0.1');
  await new Promise((resolve,reject) => {server.once('listening',resolve);server.once('error',reject);});
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path,token,options={}) => {
    const response = await fetch(base+path,{...options,headers:{...(token?{authorization:`Bearer ${token}`} : {}),...options.headers}});
    return {status:response.status,body:await response.json()};
  };
  const login = async username => {
    const response = await call('/auth/login',null,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
    assert.equal(response.status,200);return response.body.data.accessToken;
  };
  try {
    const manager = await login('manager'), staff = await login('staff'), owner = await login('owner');
    await t.test('manager sees unlinked and disabled accounts that the agents endpoint omits',async()=>{
      const agents = await call('/crm/agents',manager);
      assert.equal(agents.body.data.agents.length,2);
      const result = await call('/crm/users',manager);
      assert.equal(result.status,200);
      const data=result.body.data;
      assert.equal(data.accounts.length,5);
      assert.equal(data.accounts.find(x=>x.userId==='unlinked').chatwootAgentId,null);
      assert.equal(data.accounts.find(x=>x.userId==='disabled').active,false);
      assert.equal(data.coverage.accountsScope,'configured-crm-users');
      assert.equal(data.coverage.accountsComplete,true);
      assert.equal(data.coverage.agentsScope,'active-configured-agent-links');
      assert.deepEqual(data.assignments,[{conversationId:'55',assigneeAgentId:2,accountIds:['staff'],state:'linked'}]);
      assert.equal(data.readOnly,true);
      assert.equal(result.body.meta.readOnly,true);
      assert.equal(JSON.stringify(env.auth.users),baseline);
    });
    await t.test('patron can inspect metadata; staff and anonymous callers cannot enumerate it',async()=>{
      assert.equal((await call('/crm/users',owner)).status,200);
      for(const token of [staff,null]){
        const result=await call('/crm/users',token);
        assert.equal(result.status,token?403:401);
        assert.equal(result.body.data,undefined);
      }
    });
    await t.test('response has explicit public fields and no credential, phone, customer name or token payload',async()=>{
      const result=await call('/crm/users',manager);
      assert.equal(result.status,200);
      for(const row of result.body.data.accounts)assert.deepEqual(Object.keys(row).sort(),['active','chatwootAgentId','conflicts','displayName','mappingState','permissions','role','userId','username'].sort());
      const text=JSON.stringify(result.body.data);
      for(const secret of [password,passwordHash,'not-public','905550000001','Örnek mağaza',manager])assert(!text.includes(secret));
    });
    await t.test('shared agent ownership is reported as a conflict without picking a person',async()=>{
      env.auth.users.push(account('another-staff','personel',2));
      try{
        const result=await call('/crm/users',manager);assert.equal(result.status,200);
        const data=result.body.data;
        for(const id of ['staff','another-staff']){
          const row=data.accounts.find(x=>x.userId===id);assert.equal(row.mappingState,'conflict');assert(row.conflicts.includes('shared-agent'));
        }
        assert.deepEqual(data.assignments[0].accountIds,['staff','another-staff']);
        assert.equal(data.assignments[0].state,'conflict');
        assert.equal(env.auth.users.at(-1).chatwootAgentId,2);
      }finally{env.auth.users.pop();}
    });
    await t.test('duplicate IDs and usernames stay visible as conflicts rather than merged accounts',async()=>{
      for(const extra of [account('staff','personel',null),{...account('other-unlinked','personel',null),username:'unlinked'}]){
        env.auth.users.push(extra);
        try{
          const result=await call('/crm/users',manager);assert.equal(result.status,200);
          const records=result.body.data.accounts.filter(row=>row.userId===extra.id||row.username===extra.username);
          assert.equal(records.length,2);
          for(const row of records){assert.equal(row.mappingState,'conflict');assert(row.conflicts.includes(extra.id==='staff'?'duplicate-user-id':'duplicate-username'));}
        }finally{env.auth.users.pop();}
      }
    });
    await t.test('matching a display name never assigns an unlinked account to a representative',async()=>{
      const row=env.auth.users.find(user=>user.id==='unlinked'),old=row.displayName;
      row.displayName=env.auth.users.find(user=>user.id==='staff').displayName;
      try{
        const result=await call('/crm/users',manager);assert.equal(result.status,200);
        const account=result.body.data.accounts.find(user=>user.userId==='unlinked');
        assert.equal(account.chatwootAgentId,null);assert.equal(account.mappingState,'unlinked');
        assert.deepEqual(result.body.data.assignments[0].accountIds,['staff']);
      }finally{row.displayName=old;}
    });
    await t.test('invalid configured account makes coverage partial rather than a false full total',async()=>{
      env.auth.users.push({id:'invalid-entry',username:'not-a-login',role:'personel',passwordHash:'invalid'});
      try{
        const result=await call('/crm/users',manager);assert.equal(result.status,200);
        assert.equal(result.body.data.accounts.length,5);
        assert.equal(result.body.data.coverage.configuredAccountCount,6);
        assert.equal(result.body.data.coverage.omittedInvalidAccountCount,1);
        assert.equal(result.body.data.coverage.accountsComplete,false);
      }finally{env.auth.users.pop();}
    });
    await t.test('fresh permission and revocation checks are never replaced by a metadata cache',async()=>{
      const current=env.auth.users[0];
      current.role='personel';
      try{assert.equal((await call('/crm/users',manager)).status,401);}finally{current.role='mudur';}
      current.active=false;
      try{assert.equal((await call('/crm/users',manager)).status,401);}finally{current.active=true;}
      assert.equal((await call('/crm/users',manager)).status,200);
    });
    await t.test('clean projection identity is validated and other environments do not expose this TEST inventory',async()=>{
      const projection=process.env.CRM_CLEAN_CONVERSATION_PROJECTION_JSON;
      process.env.CRM_CLEAN_CONVERSATION_PROJECTION_JSON=projection.replace('MELISA_ERP_CLEAN_TEST_20261022','different-database');
      try{assert.equal((await call('/crm/users',manager)).status,503);}finally{process.env.CRM_CLEAN_CONVERSATION_PROJECTION_JSON=projection;}
      delete process.env.CRM_TEST_PROFILE;
      try{assert.equal((await call('/crm/users',manager)).status,404);}finally{process.env.CRM_TEST_PROFILE='clean-synthetic-20261022';}
    });
    await t.test('inventory does not create an account or allow assignment writes in shared preparation',async()=>{
      for(const path of ['/crm/users','/crm/conversations/55/assign'])assert.equal((await call(path,manager,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
      assert.equal(JSON.stringify(env.auth.users),baseline);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
    Object.assign(env.auth,previousAuth);
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});
