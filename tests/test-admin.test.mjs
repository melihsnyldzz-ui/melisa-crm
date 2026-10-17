import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {installTestAdminSession,verifyTestAdminSession} from '../apps/gateway/src/services/testAdminSession.mjs';
import {verifyCrmAccessToken,listConfiguredCrmUsers,authenticateCrmUser,createPasswordHash} from '../apps/gateway/src/services/crmAuthService.js';
import {env} from '../apps/gateway/src/config/env.js';
import {testAdminBootstrapAllowed} from '../deploy/test-server.mjs';

test('TEST bootstrap rejects foreign origins, proxy headers, other hosts/methods and URL parameters',()=>{
  const request={method:'POST',url:'/api/test-admin/session',socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62400',origin:'http://127.0.0.1:62400','sec-fetch-site':'same-origin'}};
  assert.equal(testAdminBootstrapAllowed(request),true);
  for(const change of [{method:'GET'},{url:'/api/test-admin/session?role=patron'},{socket:{remoteAddress:'192.168.1.1'}},
    ...[{origin:undefined},{origin:'http://127.0.0.1:4200'},{host:'example.com:62400'},{'sec-fetch-site':'cross-site'},
      {'x-forwarded-host':'127.0.0.1:62400'},{'x-forwarded-for':'127.0.0.1'}].map(headers=>({headers:{...request.headers,...headers}}))]){
    assert.equal(testAdminBootstrapAllowed({...request,...change}),false);
  }
});
test('TEST admin is process-local; normal real-user login, permissions and LIVE verification stay independent',t=>{
  const oldAuth=env.auth;
  const password='synthetic-role-password-2026';
  env.auth={...env.auth,jwtSecret:'synthetic-live-test-secret-32-characters',users:[
    {id:'real-staff-fixture',username:'personel',displayName:'Personel',role:'personel',active:true,passwordHash:createPasswordHash(password)}]};
  t.after(()=>{env.auth=oldAuth;});
  assert.equal(verifyTestAdminSession('invalid'),null);
  assert.throws(()=>installTestAdminSession({uiOrigin:'http://127.0.0.1:4200',gatewayOrigin:'http://127.0.0.1:62401'}),/TEST_ADMIN_ORIGIN_REQUIRED/);
  const usersBefore=listConfiguredCrmUsers();
  const issue=installTestAdminSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401'});
  const {accessToken}=issue();
  const actor=verifyCrmAccessToken(accessToken);
  assert.equal(actor.testAdmin,true);assert.equal(actor.displayName,'TEST ADMIN');assert.equal(actor.role,'patron');
  assert.deepEqual(actor.permissions,['crm.view','crm.send','crm.assign','crm.agents','crm.manage']);
  assert.ok(verifyCrmAccessToken(accessToken,{includeContext:true}).expiresAt>Date.now());
  assert.deepEqual(listConfiguredCrmUsers(),usersBefore);
  const normal=authenticateCrmUser({username:'personel',password});
  assert.equal(verifyCrmAccessToken(normal.accessToken).role,'personel');assert.equal(normal.user.testAdmin,undefined);
  // A fresh default gateway process never installs the TEST verifier, even if
  // someone supplies dotenv-like TEST flags or the correct TEST issuer claim.
  const code="import {env} from './apps/gateway/src/config/env.js';import {verifyCrmAccessToken} from './apps/gateway/src/services/crmAuthService.js';env.auth.jwtSecret='synthetic-live-test-secret-32-characters';try{verifyCrmAccessToken(process.env.SYNTHETIC_TEST_TOKEN);process.exit(9)}catch(e){if(e.code!=='AUTH_TOKEN_INVALID')process.exit(8)}";
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../',import.meta.url),env:{...process.env,SYNTHETIC_TEST_TOKEN:accessToken,CRM_TEST_ADMIN_ENABLED:'true'},encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  installTestAdminSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401'});
  assert.equal(verifyTestAdminSession(accessToken),null,'process replacement invalidates the old TEST token');
});
