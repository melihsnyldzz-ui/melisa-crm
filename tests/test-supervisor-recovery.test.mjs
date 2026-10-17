import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryDecision,probeTestDependencies} from '../deploy/test-supervisor.mjs';
test('short child failures back off and stop after five recoveries; stable service resets budget',()=>{
 let count=0;
 for(const delayMs of [5000,10000,20000,40000,60000]){const result=recoveryDecision(count,1000);assert.equal(result.delayMs,delayMs);assert.equal(result.state,'restart-wait');count=result.failures;}
 assert.deepEqual(recoveryDecision(count,1000),{state:'circuit-open',failures:5,delayMs:0});
 assert.deepEqual(recoveryDecision(count,120000),{state:'restart-wait',failures:1,delayMs:5000});
});
const native={ok:true,environment:'CANONICAL_TEST',port:62404,database:'MELISA_ERP_SIRKET_TEST_20260929_01',purpose:'crm-order-draft-only',stockEffect:false,ledgerEffect:false,sourceCommit:'n',packageId:'p'};
const erp={ok:true,environment:'CANONICAL_TEST',port:4144,databaseName:native.database};
test('read-only dependency probes require ERP and native identity and authenticated Chatwoot profile',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>url.includes('/profile')?{id:3}:url.includes('62404')?native:erp};};
 const result=await probeTestDependencies({fetchImpl,chatwootUrl:'http://127.0.0.1:3100',chatwootToken:'fixture-only',nativeSourceCommit:'n',nativePackageId:'p'});
 assert.deepEqual(result,{chatwoot:{state:'ready'},erp:{state:'ready'},native:{state:'ready'}});
 assert.equal(calls.length,3);assert.ok(calls.every(call=>!call.options.method&&!call.options.body&&call.options.redirect==='error'));
 assert.equal(calls.find(call=>call.url.endsWith('/profile')).options.headers.api_access_token,'fixture-only');
});
test('late Chatwoot stays unavailable while independent ERP/native remain ready and later recovers',async()=>{
 let ready=false;
 const fetchImpl=async url=>({ok:!url.includes('/profile')||ready,json:async()=>url.includes('/profile')?{id:3}:url.includes('62404')?native:erp});
 const config={fetchImpl,chatwootUrl:'http://127.0.0.1:3100',chatwootToken:'fixture-only',nativeSourceCommit:'n',nativePackageId:'p'};
 assert.deepEqual(await probeTestDependencies(config),{chatwoot:{state:'unavailable'},erp:{state:'ready'},native:{state:'ready'}});
 ready=true;assert.equal((await probeTestDependencies(config)).chatwoot.state,'ready');
});
test('wrong DB, wrong native source and unapproved Chatwoot origin never report ready',async()=>{
 let calls=0;const fetchImpl=async url=>{calls++;return{ok:true,json:async()=>url.includes('62404')?{...native,sourceCommit:'foreign'}:{...erp,databaseName:'LIVE'}};};
 const result=await probeTestDependencies({fetchImpl,chatwootUrl:'https://external.example',chatwootToken:'fixture-only',nativeSourceCommit:'n',nativePackageId:'p'});
 assert.deepEqual(result,{chatwoot:{state:'identity-mismatch'},erp:{state:'identity-mismatch'},native:{state:'identity-mismatch'}});assert.equal(calls,2);
 assert.ok(!JSON.stringify(result).includes('fixture-only'));
});
