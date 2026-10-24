import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSendPayload} from '../src/outboundMedia.js';
import {newRequestId} from '../src/lib/requestId.js';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
// Execute the actual composer UUID/payload preflight with RAM-only dependencies.
// The full App's esbuild harness stalls in this host; this is not a React/GUI test.
function preflight(cryptoApi){
 const body=app.match(/    ((?:const|let) clientRequestId[\s\S]*?)\n    if \(liveSession\)/)?.[1];assert(body);
 const states=[];
 const run=new Function('window','newRequestId','selectedMedia','content','validateSendPayload','setSendStates','conversationId',`${body}\nreturn clientRequestId;`);
 return {id:run({crypto:cryptoApi},newRequestId,null,'Synthetic LAN text',validateSendPayload,update=>states.push(update({})),'55'),states};
}
test('HTTP LAN UUID: actual composer preflight accepts getRandomValues without randomUUID',()=>{
 const result=preflight({getRandomValues:bytes=>{bytes.fill(5);return bytes;}});
 assert.match(result.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);assert.deepEqual(result.states,[]);
 const sent=[];if(result.id)sent.push({clientRequestId:result.id});assert.equal(sent.length,1);
});
test('HTTP LAN UUID: actual composer preflight exposes controlled failure and never proceeds to transport without secure randomness',()=>{
 const result=preflight({});assert.equal(result.id,undefined);assert.equal(result.states[0]['55'].state,'failed');assert.match(result.states[0]['55'].text,/güvenli rastgele kimlik/);
});
test('secure UUID helper retains v4 bits and strong fallback; failures never use predictable randomness',()=>{
 assert.equal(newRequestId({getRandomValues:bytes=>{bytes.fill(255);return bytes;}}),'ffffffff-ffff-4fff-bfff-ffffffffffff');
 const strong='00000000-0000-4000-8000-000000000001';assert.equal(newRequestId({randomUUID:()=>strong}),strong);
 for(const cryptoApi of [null,{}, {randomUUID:()=> 'invalid'}, {getRandomValues(){throw Error('Synthetic failure');}}]){
  assert.throws(()=>newRequestId(cryptoApi),/güvenli rastgele kimlik/);
 }
 assert.match(app,/import \{ newRequestId \} from "\.\/lib\/requestId.js"/);
 assert.doesNotMatch(app,/window\.crypto\.randomUUID\(/);
});
