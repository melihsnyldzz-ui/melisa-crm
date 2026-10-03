import test from "node:test";
import assert from "node:assert/strict";
import { createPermissionRefresh } from "../src/permissionRefresh.js";
import { normalizePermissions } from "../src/liveApi.js";

test("concurrent permission checks share one request and use fresh server permission", async () => {
  let finish;
  let calls = 0;
  let session = normalizePermissions({ role: "patron", liveSendEnabled: false });
  const refresh = createPermissionRefresh({
    getToken: () => "test-session", fetchSession: () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
    onSession: (value) => { session = value; }, onExpired: () => {}, onState: () => {},
  });
  const first = refresh();
  const concurrent = refresh();
  assert.equal(first, concurrent);
  assert.equal(calls, 1);
  finish(normalizePermissions({ role: "patron", liveSendEnabled: true }));
  await first;
  assert.equal(session.liveSendEnabled, true);
});

test("late permission responses cannot restore a logged-out or replaced session", async () => {
  let token = "old-session";
  let finish;
  let applied = false;
  const refresh = createPermissionRefresh({
    getToken: () => token, fetchSession: () => new Promise((resolve) => { finish = resolve; }),
    onSession: () => { applied = true; }, onExpired: () => {}, onState: () => {},
  });
  const pending = refresh();
  token = "";
  finish({ liveSendEnabled: true });
  assert.equal(await pending, null);
  assert.equal(applied, false);
  assert.equal(await refresh(), null);
});

test("expired auth is handled without sending and temporary failure reports an error", async () => {
  for (const status of [401, 502]) {
    let expired = false;
    let message = "";
    const refresh = createPermissionRefresh({
      getToken: () => "test-session", fetchSession: async () => { throw Object.assign(new Error("failure"), { status }); },
      onSession: () => assert.fail("failed permission must not be applied"),
      onExpired: () => { expired = true; }, onState: (state) => { if (state.error) message = state.error; },
    });
    await assert.rejects(refresh());
    assert.equal(expired, status === 401);
    assert.equal(Boolean(message), status !== 401);
  }
});

test("unknown permission is distinct from disabled, and health or role cannot enable sending", () => {
  assert.equal(normalizePermissions({ role: "patron" }).liveSendState, "unknown");
  assert.equal(normalizePermissions({ role: "patron", providerConnected: true, sendReady: true }).liveSendEnabled, false);
  assert.equal(normalizePermissions({ role: "patron", liveSendEnabled: false }).liveSendState, "disabled");
  assert.equal(normalizePermissions({ role: "patron", liveSendEnabled: true }).liveSendState, "enabled");
  assert.equal(normalizePermissions({ role: "personel", liveSendEnabled: true }).liveSendState, "forbidden");
});

test('same-token replacement with a new generation cannot receive old permission or expiry results', async () => {
  let generation=0,finishOld;const applied=[],states=[];
  const refresh=createPermissionRefresh({getToken:()=> 'same-token',getGeneration:()=>generation,fetchSession:()=>generation===0?new Promise(resolve=>finishOld=resolve):Promise.resolve({fresh:true}),onSession:value=>applied.push(value),onExpired:()=>assert.fail('old result cannot expire current session'),onState:value=>states.push(value)});
  const old=refresh();generation++;await refresh();finishOld({stale:true});assert.equal(await old,null);assert.deepEqual(applied,[{fresh:true}]);assert.equal(states.filter(x=>x.busy===false).length,1);
});

test('real API transport is isolated for a new permission generation even if the token is identical',async()=>{
 const {liveApi}=await import('../src/liveApi.js');const before=globalThis.fetch;let generation=0;const calls=[],applied=[];
 globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve});options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});
 try{
  const refresh=createPermissionRefresh({getToken:()=> 'same-transport-token',getGeneration:()=>generation,fetchSession:(key,options)=>liveApi.session(key,options),onSession:value=>applied.push(value),onExpired:()=>assert.fail('stale expiry'),onState:()=>{}});
  const old=refresh();const rejected=assert.rejects(old,{name:'AbortError'});await Promise.resolve();generation++;const next=refresh();await Promise.resolve();assert.equal(calls.length,2);assert(calls[0].options.signal.aborted);
  calls[1].resolve(Response.json({success:true,data:{id:42,username:'fresh-profile',role:'personel'}}));await next;await rejected;assert.deepEqual(applied.map(x=>x.username),['fresh-profile']);refresh.invalidate();
 }finally{globalThis.fetch=before;}
});
