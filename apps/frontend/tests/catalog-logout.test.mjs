import test from 'node:test';
import assert from 'node:assert/strict';
import {closeCatalogSession} from '../src/catalog/logout.js';
import {liveApi} from '../src/liveApi.js';
test('explicit logout uses the captured token once and immediately clears local photos/session',async()=>{
 const before=globalThis.fetch;let token='mock-closing-token',resolve;const calls=[],events=[];
 globalThis.fetch=(url,options)=>{calls.push({url,options});return new Promise(done=>resolve=done);};
 try{
  const close=()=>{const closing=token;return closeCatalogSession({explicitLogout:Boolean(closing),disconnect:()=>liveApi.catalogSignOut(closing),clearPhotos:()=>events.push('photos'),clearLocal:()=>{token='';events.push('local');}});};
  const first=close();const second=close();assert.deepEqual(events,['photos','local','photos','local']);assert.equal(token,'');
  // Let the request-control transport run; no automatic second mutation may follow.
  await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/live/crm/catalog/auth/sign-out');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.body,'{}');assert.equal(calls[0].options.headers.Authorization,'Bearer mock-closing-token');
  resolve(Response.json({success:true,data:{connected:false}}));assert.deepEqual(await first,{serverSignOutConfirmed:true});assert.deepEqual(await second,{serverSignOutConfirmed:false});
 }finally{globalThis.fetch=before;}
});
test('expiry/local-only cleanup does not call catalog authentication and cannot claim remote confirmation',async()=>{
 let calls=0,cleared=0;const result=await closeCatalogSession({explicitLogout:false,disconnect:()=>{calls++;},clearPhotos:()=>cleared++,clearLocal:()=>cleared++});assert.equal(calls,0);assert.equal(cleared,2);assert.equal(result.serverSignOutConfirmed,false);
});
test('404, network failure and synchronous disconnect failure keep local logout with no retry or remote success',async()=>{
 for(const disconnect of [()=>Promise.reject(Object.assign(new Error('Missing'),{status:404})),()=>Promise.reject(new TypeError('Network')),()=>{throw new Error('Sync');}]){
  let calls=0,cleared=0;const result=await closeCatalogSession({disconnect:()=>{calls++;return disconnect();},clearLocal:()=>cleared++});assert.equal(calls,1);assert.equal(cleared,1);assert.equal(result.serverSignOutConfirmed,false);
 }
});

test('server invalidation is bounded to three seconds while local cleanup completes immediately with no retry',async()=>{
 const previousFetch=globalThis.fetch,previousTimeout=globalThis.setTimeout;let cleared=0,calls=0,signal;const durations=[];
 try {
  globalThis.setTimeout=(fn,ms,...args)=>{durations.push(ms);return previousTimeout(fn,ms===3000?5:ms,...args);};
  globalThis.fetch=async(_url,options)=>{calls++;signal=options.signal;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Synthetic timeout','AbortError')),{once:true}));};
  const pending=closeCatalogSession({disconnect:()=>liveApi.catalogSignOut('synthetic-timeout'),clearPhotos:()=>cleared++,clearLocal:()=>cleared++});assert.equal(cleared,2);
  assert.deepEqual(await pending,{serverSignOutConfirmed:false});assert.equal(calls,1);assert(signal.aborted);assert(durations.includes(3000));assert.equal(cleared,2);
 }finally{globalThis.fetch=previousFetch;globalThis.setTimeout=previousTimeout;}
});
