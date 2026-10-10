import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SHARED_STABLE_ORIGIN} from '../deploy/stable-transport.mjs';

test('full isolated gateway permits only authenticated exact stable sign-out and revokes subsequent catalog reads',async t=>{
 const keys=['CRM_CATALOG_UI_ORIGINS','CRM_STABLE_TRANSPORT','CRM_ISOLATED_PREPARATION','CRM_TEST_PORT_BASE','CRM_TEST_ERP_ORIGIN','CRM_TEST_EXPECTED_DATABASE'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 // Bind the router before enabling runtime health; no immutable runtime is started.
 process.env.CRM_CATALOG_UI_ORIGINS=SHARED_STABLE_ORIGIN;delete process.env.CRM_STABLE_TRANSPORT;
 const {createApp}=await import('../apps/gateway/src/app.js');
 const {env}=await import('../apps/gateway/src/config/env.js');
 const {createPasswordHash}=await import('../apps/gateway/src/services/crmAuthService.js');
 const priorAuth={...env.auth,users:env.auth.users};
 Object.assign(process.env,{CRM_STABLE_TRANSPORT:'true',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_PORT_BASE:'62700',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'});
 const password='synthetic-offline-password';
 Object.assign(env.auth,{jwtSecret:'synthetic-offline-secret-at-least-thirty-two-characters',issuer:'stable-signout-fixture',audience:'stable-signout-fixture',users:[{id:'stable-fixture-personnel',username:'fixture',displayName:'Fixture',role:'personel',active:true,passwordHash:createPasswordHash(password,'synthetic-stable-salt')}]});
 const nativeFetch=globalThis.fetch;let upstreamReads=0;
 const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(env.auth,priorAuth);for(const[key,value]of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value;});
 const root='http://127.0.0.1:'+server.address().port;
 globalThis.fetch=async(input,options)=>{if(String(input).startsWith(root+'/'))return nativeFetch(input,options);upstreamReads++;return Response.json({success:true,data:[],meta:{source:'melisa-erp-catalog',catalogVersion:'melisa-catalog.v1',environment:'CANONICAL_TEST',sourceDatabaseVerified:true,verifiedCrmActorId:'stable-fixture-personnel',verifiedCrmRole:'personel',cached:false,page:1,limit:50,total:0}});};
 const login=await nativeFetch(root+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:SHARED_STABLE_ORIGIN},body:JSON.stringify({username:'fixture',password})});assert.equal(login.status,200);
 const token=(await login.json()).data.accessToken;
 const headers={authorization:'Bearer '+token,origin:SHARED_STABLE_ORIGIN,'content-type':'application/json'};
 const read=()=>nativeFetch(root+'/crm/catalog/products',{headers:{authorization:headers.authorization}});
 assert.equal((await read()).status,200);assert.equal(upstreamReads,1);
 const signOut=(path='/crm/catalog/auth/sign-out',changes={},body='{}')=>nativeFetch(root+path,{method:'POST',headers:{...headers,...changes},body});
 for(const [route,change]of [['/crm/catalog/auth/sign-out',{origin:'http://127.0.0.1:62700'}],['/crm/catalog/auth/sign-out',{origin:SHARED_STABLE_ORIGIN+'.evil'}],['/crm/catalog/auth/sign-out',{authorization:''}],['/crm/catalog/auth/sign-out',{authorization:'Bearer invalid'}],['/crm/catalog/auth/sign-out',{'x-forwarded-for':'127.0.0.1'}],['/crm/catalog/auth/sign-out?extra=1',{}],['/crm/catalog/auth/sign-in',{}],['/crm/conversations/55/messages',{}]])assert.equal((await signOut(route,change)).status,403);
 process.env.CRM_STABLE_TRANSPORT='false';assert.equal((await signOut()).status,403);process.env.CRM_STABLE_TRANSPORT='true';
 process.env.CRM_TEST_EXPECTED_DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_01';assert.equal((await signOut()).status,403);process.env.CRM_TEST_EXPECTED_DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_02';
 assert.equal((await signOut('/crm/catalog/auth/sign-out',{},'{"extra":true}')).status,400);
 assert.equal((await read()).status,200);assert.equal(upstreamReads,2);
 const result=await signOut();assert.equal(result.status,200);assert.equal((await result.json()).data.connected,false);
 const revoked=await read();assert.equal(revoked.status,401);assert.equal((await revoked.json()).error.code,'CATALOG_SESSION_REVOKED');assert.equal(upstreamReads,2);
});
