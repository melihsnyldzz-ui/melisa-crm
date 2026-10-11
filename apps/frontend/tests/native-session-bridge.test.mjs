import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeSessionBridge,createRememberedNormalSession} from '../src/nativeSessionBridge.js';
import {bindTerminalNavigation} from '../src/terminalNavigation.js';
const user={id:'own-agent-test',username:'agent-test',role:'personel',chatwootAgentId:3,permissions:['crm.view']};
const result=(accessToken='access',refreshToken='refresh')=>({accessToken,refreshToken,expiresAt:100000,user});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('bridge uses only native object replies, exact origin, and request IDs',async()=>{const calls=[],native={postMessage(raw){calls.push(JSON.parse(raw));}},host={location:{origin:'http://192.168.1.46:62700'},MelisaProtectedSession:native};const bridge=createNativeSessionBridge({window:host});const pending=bridge.get();await Promise.resolve();native.onmessage({data:JSON.stringify({v:1,id:'wrong',ok:true,session:{accessToken:'wrong'}})});native.onmessage({data:JSON.stringify({v:1,id:calls[0].id,ok:true,session:null})});assert.equal(await pending,null);assert.deepEqual(Object.keys(calls[0]).sort(),['action','id','v']);for(const origin of ['http://192.168.1.99:62700','http://192.168.1.46:5234','https://192.168.1.46:62700'])assert.equal(createNativeSessionBridge({window:{...host,location:{origin}}}),null);});
test('repeated bridge construction shares one reply handler and FIFO including clear',async()=>{
 const calls=[],native={postMessage:raw=>calls.push(JSON.parse(raw))},host={location:{origin:'http://192.168.1.46:62700'},MelisaProtectedSession:native};
 const first=createNativeSessionBridge({window:host}),read=first.get(),handler=native.onmessage,second=createNativeSessionBridge({window:host});assert.equal(first,second);assert.equal(native.onmessage,handler);
 const clear=second.clear();await Promise.resolve();assert.equal(calls.length,1);native.onmessage({data:JSON.stringify({v:1,id:calls[0].id,ok:true,session:null})});await read;for(let i=0;i<4;i++)await Promise.resolve();assert.equal(calls.length,2);assert.equal(calls[1].action,'clear');assert.notEqual(calls[0].id,calls[1].id);native.onmessage({data:JSON.stringify({v:1,id:calls[1].id,ok:true,session:null})});await clear;
});
test('normal first login is protected only after independently verified /me; reopen rotates and rechecks identity',async()=>{let saved=null,refreshed=0;const bridge={async clear(){saved=null;},async put(x){saved=x;},async get(){return saved;}};const refresh=async token=>{assert.equal(token,'refresh');refreshed++;return result('renewed','rotated');};const m=createRememberedNormalSession({bridge,refresh,logout:async()=>{}}),epoch=await m.begin();assert.equal(saved,null);await m.remember(result(),user,epoch);assert.equal(saved.userId,user.id);assert(!Object.hasOwn(saved,'password'));const reopened=createRememberedNormalSession({bridge,refresh,logout:async()=>{}});const resumed=await reopened.resume();assert.equal(refreshed,1);assert.equal(saved.refreshToken,'rotated');await reopened.remember(resumed.result,user,resumed.epoch);assert.equal(saved.refreshToken,'rotated');assert.equal(saved.accessToken,'renewed');});
test('a rotated grant survives transient /me failure and the retry uses its new token; /me denial can clear/revoke it',async()=>{
 let saved={userId:user.id,username:user.username,refreshToken:'first'},attempt=0;const tokens=[],revoked=[];
 const bridge={get:async()=>saved,put:async x=>{saved=x;},clear:async()=>{saved=null;}};
 const manager=createRememberedNormalSession({bridge,logout:async token=>revoked.push(token),refresh:async token=>{tokens.push(token);return result('access',`rotated-${++attempt}`);}});
 await manager.resume(); // Next /auth/me503 must not clear this protected secret.
 const restarted=createRememberedNormalSession({bridge,logout:async token=>revoked.push(token),refresh:async token=>{tokens.push(token);return result('access','third');}});
 await restarted.resume();assert.deepEqual(tokens,['first','rotated-1']);await restarted.clear();assert.equal(saved,null);assert.deepEqual(revoked,['third']);
});
test('identity mismatch, bootstrap token and revoked refresh cannot restore a remembered session',async()=>{const bridge={get:async()=>({userId:user.id,username:user.username,refreshToken:'refresh'}),put:async()=>{},clear:async()=>{}};
 const changed=createRememberedNormalSession({bridge,logout:async()=>{},refresh:async()=>({...result(),user:{...user,id:'other'}})});await assert.rejects(()=>changed.resume(),{status:401});
 const revoked=createRememberedNormalSession({bridge,logout:async()=>{},refresh:async()=>{throw Object.assign(Error('revoked'),{status:401});}});await assert.rejects(()=>revoked.resume(),{status:401});
 const normal=createRememberedNormalSession({bridge,logout:async()=>{},refresh:async()=>result()});const epoch=await normal.begin();await assert.rejects(()=>normal.remember({...result(),user:{...user,testPersonnel:true}},user,epoch),{status:401});});
test('logout during a delayed renewal prevents late restore; clear is ordered after a pending protected write',async()=>{const renewal=defer(),writes=[],bridge={get:async()=>({userId:user.id,username:user.username,refreshToken:'refresh'}),put:async()=>{writes.push('put');},clear:async()=>{writes.push('clear');}};const m=createRememberedNormalSession({bridge,refresh:()=>renewal.promise,logout:async()=>{}});const pending=m.resume();await Promise.resolve();await Promise.resolve();await m.clear();renewal.resolve(result());assert.equal(await pending,null);assert.deepEqual(writes,['clear']);
 const put=defer();bridge.put=async()=>{writes.push('put');await put.promise;};const epoch=await m.begin(),remember=m.remember(result(),user,epoch);await Promise.resolve();const clear=m.clear();put.resolve();await Promise.all([remember,clear]);assert.equal(writes.at(-1),'clear');});
test('terminal logout acknowledgement waits for protected deletion and server revocation; failures report unavailable',async()=>{
 for(const fails of [false,true]){const deletion=defer(),revocation=defer(),messages=[];let listener;
 const bridge={get:async()=>({refreshToken:'refresh'}),clear:()=>deletion.promise};
 const manager=createRememberedNormalSession({bridge,refresh:async()=>result(),logout:()=>revocation.promise});
 const parent={postMessage:data=>messages.push(data.action)},win={parent,addEventListener:(_name,fn)=>listener=fn,removeEventListener(){}};
 bindTerminalNavigation({window:win,entry:{enabled:true,erpOrigin:'http://192.168.1.46:5234'},onLogout:()=>manager.clear()});
 listener({source:parent,origin:'http://192.168.1.46:5234',data:{type:'melisa-terminal-parent',version:1,action:'logout'}});
 await Promise.resolve();await Promise.resolve();assert.deepEqual(messages,['ready']);deletion.resolve();await Promise.resolve();await Promise.resolve();assert.deepEqual(messages,['ready']);
 if(fails)revocation.resolve(Promise.reject(Error('offline')));else revocation.resolve();
 for(let i=0;i<8;i++)await Promise.resolve();assert.equal(messages.at(-1),fails?'unavailable':'logged-out');
 }
});
