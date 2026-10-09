import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../apps/gateway/node_modules/jsonwebtoken/index.js';
import http from 'node:http';
import {installTestPersonnelSession,verifyTestPersonnelSession} from '../apps/gateway/src/services/testPersonnelSession.mjs';
import {verifyCrmAccessToken,publicCrmUser} from '../apps/gateway/src/services/crmAuthService.js';
import {createTestUiHandler,testPersonnelBootstrapAllowed,testUiRequestAllowed,configureTestServerEnvironment} from '../deploy/test-server.mjs';
import path from 'node:path';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
const origins={uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401'};
const fixture=()=>({id:'fixture-staff',username:'crm-ahmet',displayName:'Ahmet',active:true,role:'personel',chatwootAgentId:3,permissions:['crm.view']});
test('owner-installed rehearsal keeps real identity and normal permissions; caps are view/send only and expire in 15m',()=>{
 let user=fixture();const before=structuredClone(user),issue=installTestPersonnelSession({...origins,username:user.username,resolveUser:()=>user});
 const a=issue(),b=issue(),claims=jwt.decode(a.accessToken);
 assert.equal(claims.exp-claims.iat,900);assert.notEqual(claims.jti,jwt.decode(b.accessToken).jti);
 const actor=verifyCrmAccessToken(a.accessToken);assert.equal(actor.id,before.id);assert.equal(actor.chatwootAgentId,3);assert.equal(actor.role,'personel');assert.equal(actor.testPersonnel,true);assert.deepEqual(actor.permissions,['crm.view','crm.send']);assert.deepEqual(user,before);
 assert.equal(publicCrmUser(actor).testPersonnel,true);assert.equal(actor.permissions.includes('crm.manage'),false);
 assert.equal(verifyTestPersonnelSession(a.accessToken+'invalid'),null);
 user={...user,chatwootAgentId:4};assert.equal(verifyTestPersonnelSession(a.accessToken),null,'assignment identity changes revoke session');
 assert.throws(issue,/TEST_PERSONNEL_IDENTITY_REQUIRED/);
 user=fixture();installTestPersonnelSession({...origins,username:user.username,resolveUser:()=>user});assert.equal(verifyTestPersonnelSession(a.accessToken),null,'process-key replacement revokes old sessions');
 user={...user,active:false};assert.equal(verifyTestPersonnelSession(b.accessToken),null);
});
test('installer rejects managers, foreign endpoints and client-selected identities',()=>{
 for(const patch of [{uiOrigin:'http://192.168.1.46:62400'},{gatewayOrigin:'http://127.0.0.1:4200'},{username:'crm-mehmet'}])assert.throws(()=>installTestPersonnelSession({...origins,username:'crm-ahmet',resolveUser:fixture,...patch}));
 assert.throws(()=>installTestPersonnelSession({...origins,username:'crm-ahmet',resolveUser:()=>({...fixture(),role:'patron'})}));
});
const request=()=>({method:'POST',url:'/api/test-personnel/session',socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62400',origin:'http://127.0.0.1:62400','sec-fetch-site':'same-origin'}});
test('bootstrap exact socket/origin/host/path/method and no forwarded headers',()=>{
 assert.equal(testPersonnelBootstrapAllowed(request()),true);
 for(const patch of [{method:'GET'},{url:'/api/test-personnel/session?actor=other'},{socket:{remoteAddress:'192.168.1.46'}},...[{host:'localhost:62400'},{origin:'http://127.0.0.1:5194'},{forwarded:'for=127.0.0.1'},{'x-forwarded-proto':'http'},{'x-real-ip':'127.0.0.1'},{'x-forwarded-for':'127.0.0.1'},{'sec-fetch-site':'cross-site'}].map(headers=>({headers:{...request().headers,...headers}}))])assert.equal(testPersonnelBootstrapAllowed({...request(),...patch}),false);
});
test('bootstrap consumes only empty JSON object and cannot fall back to TEST admin',async t=>{
 let personnel=0,admin=0;
 const server=http.createServer(createTestUiHandler({assets:path.resolve('fixture-assets'),createTestSession:()=>{admin++;return{};},createPersonnelSession:()=>{personnel++;return{tokenType:'Bearer'};}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 async function call(body,origin='http://127.0.0.1:62400') {return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/test-personnel/session',method:'POST',headers:{Host:'127.0.0.1:62400',Origin:origin,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end(body);});}
 assert.equal(await call('{"actor":"manager"}'),400);assert.equal(await call('{}','http://127.0.0.1:5194'),403);assert.equal(await call('{}'),200);assert.equal(personnel,1);assert.equal(admin,0);
});
test('terminal iframe navigation allows only the same-host ERP terminal and never cross-origin API/bootstrap',()=>{
 const r={method:'GET',url:'/?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5194',socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62400','sec-fetch-site':'same-site','sec-fetch-dest':'iframe',referer:'http://127.0.0.1:5194/terminal.html'}};
 assert.equal(testUiRequestAllowed(r),true);
 for(const patch of [{method:'POST'},{url:'/api/test-personnel/session'},{url:'/api/live/crm/conversations'},{headers:{...r.headers,referer:'http://127.0.0.1:4200/terminal.html'}},{headers:{...r.headers,referer:'http://127.0.0.1:5194/ornek-akis.html'}},{headers:{...r.headers,'sec-fetch-dest':'document'}},{headers:{...r.headers,origin:'http://127.0.0.1:5194'}}])assert.equal(testUiRequestAllowed({...r,...patch}),false);
});
test('personnel rehearsal cannot be enabled by baseline dotenv',()=>{
 const env={CRM_BASELINE_ENV:'fixture'};configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env,loadBaseline:()=>{env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME='crm-ahmet';return {parsed:{}};}});assert.equal(env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,'');
 const opted={CRM_BASELINE_ENV:'fixture',CRM_TEST_TERMINAL_PERSONNEL_USERNAME:'crm-ahmet'};configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env:opted,loadBaseline:()=>({parsed:{}})});assert.equal(opted.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,'crm-ahmet');
});

const sharedEnv=()=>({CRM_BASELINE_ENV:'fixture',CRM_TEST_PORT_BASE:'62600',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'});
test('finite shared preparation installs only existing crm-ahmet rehearsal and keeps side effects off',()=>{
 const env=sharedEnv();configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env,loadBaseline:()=>({parsed:{}})});
 assert.equal(env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,'crm-ahmet');
 for(const key of ['WHATSAPP_SEND_ENABLED','WHATSAPP_LIVE_SEND_APPROVED','WAAPI_CHATWOOT_BRIDGE_ENABLED','CRM_PAID_AI_ENABLED'])assert.equal(env[key],'false');
 assert.throws(()=>configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env:{...sharedEnv(),CRM_TEST_TERMINAL_PERSONNEL_USERNAME:'patron'},loadBaseline:()=>({parsed:{}})}),/TEST_PERSONNEL_IDENTITY_REQUIRED/);
});
test('shared personnel bootstrap retains exact identity, assigned access and rejects foreign request contexts',async t=>{
 const endpoints=resolveTestEndpoints(sharedEnv()),user=fixture(),before=structuredClone(user);
 const issue=installTestPersonnelSession({uiOrigin:endpoints.uiOrigin,gatewayOrigin:endpoints.gatewayOrigin,username:'crm-ahmet',resolveUser:()=>user});
 const server=http.createServer(createTestUiHandler({assets:path.resolve('fixture-assets'),endpoints,createTestSession:()=>{throw Error('No admin fallback');},createPersonnelSession:issue}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 async function call(body='{}',extra={}){return new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/test-personnel/session',method:'POST',headers:{host:'127.0.0.1:62600',origin:endpoints.uiOrigin,'content-type':'application/json',...extra}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({status:response.statusCode,body}));});request.on('error',reject);request.end(body);});}
 const accepted=await call();assert.equal(accepted.status,200);
 const actor=verifyCrmAccessToken(JSON.parse(accepted.body).accessToken);assert.equal(actor.id,user.id);assert.equal(actor.role,'personel');assert.equal(actor.chatwootAgentId,3);assert.equal(actor.testAdmin,undefined);assert.deepEqual(user,before);
 for(const headers of [{origin:'http://127.0.0.1:5224'},{host:'127.0.0.1:62400'},{'sec-fetch-site':'cross-site'},{'x-forwarded-for':'127.0.0.1'},{host:'192.168.1.46:62600',origin:'http://192.168.1.46:62600'}])assert.equal((await call('{}',headers)).status,403);
 assert.equal((await call('{"username":"patron"}')).status,400);
});
