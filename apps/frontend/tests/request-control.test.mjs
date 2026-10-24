import test from "node:test";
import assert from "node:assert/strict";
import { createRequestControl, POLL_INTERVAL, requestBudgetScope, MAX_SCOPED_COOLDOWNS } from "../src/requestControl.js";

test("429 stops reads and manual sends until Retry-After without queuing a send", async () => {
  let time = 1000;
  let sendCalls = 0;
  const control = createRequestControl({ now: () => time });
  await assert.rejects(control.run("inbox", async () => new Response("Too many requests", { status: 429, headers: { "Retry-After": "30" } })), { status: 429 });
  const send = () => { sendCalls++; return Promise.resolve(new Response("ok")); };
  await assert.rejects(control.run("send", send), { status: 429, code: "CRM_RATE_LIMITED", retryAfterMs: 30000 });
  time += 29999;
  await assert.rejects(control.run("inbox", send), { status: 429 });
  assert.equal(sendCalls, 0);
  time += 1;
  assert.equal(sendCalls, 0, "elapsed cooldown must never automatically send");
  await control.run("send", send);
  assert.equal(sendCalls, 1);
});

test("HTTP-date, gateway reset header and absent headers all produce a backoff", async () => {
  const start = Date.parse("2026-09-28T21:00:00Z");
  for (const [headers, milliseconds] of [
    [{ "Retry-After": "Mon, 28 Sep 2026 21:02:00 GMT" }, 120000],
    [{ "RateLimit-Reset": "179" }, 179000],
    [{}, 60000],
  ]) {
    const control = createRequestControl({ now: () => start });
    await assert.rejects(control.run("read", async () => new Response("", { status: 429, headers })), { status: 429, retryAfterMs: milliseconds });
  }
});

test("overlapping reads share transport but each caller can consume the JSON", async () => {
  const control = createRequestControl();
  let finish;
  let calls = 0;
  const operation = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const first = control.run("account-a:inbox", operation, true);
  const second = control.run("account-a:inbox", operation, true);
  finish(Response.json({ messages: [1, 2] }));
  assert.equal(calls, 1);
  assert.deepEqual(await (await first).json(), { messages: [1, 2] });
  assert.deepEqual(await (await second).json(), { messages: [1, 2] });
});

test("different accounts never share a read and uncertain sends never retry", async () => {
  const control = createRequestControl();
  let calls = 0;
  const operation = async () => { calls++; return Response.json({ account: calls }); };
  const results = await Promise.all([control.run("a:inbox", operation, true), control.run("b:inbox", operation, true)]);
  assert.equal(calls, 2);
  assert.deepEqual(await Promise.all(results.map((r) => r.json())), [{ account: 1 }, { account: 2 }]);
  let sends = 0;
  const result = await control.run("message", async () => { sends++; return new Response("provider unknown", { status: 502 }); });
  assert.equal(result.status, 502);
  assert.equal(sends, 1);
});

test("steady-state polling reserves over 25% of the current gateway quota for user actions", () => {
  const requests = Object.values(POLL_INTERVAL).reduce((total, interval) => total + Math.ceil(900000 / interval), 0);
  assert.ok(requests <= 225, `${requests} background requests leave insufficient capacity out of 300`);
});

test('only exact gateway budget routes are scoped candidates', () => {
  for (const [path, method, expected] of [
    ['/crm/catalog/products?page=1', 'GET', 'catalog'],
    ['/crm/catalog/products/vega-42/photo', 'GET', 'catalog'],
    ['/auth/me', 'GET', 'verification'], ['/auth/login', 'POST', 'login'],
    ['/crm/conversations/55/translate', 'POST', 'translation'],
    ['/crm/conversations/55/sales-draft', 'POST', 'translation'],
    ['/crm/catalog/products/vega-42/photo/extra', 'GET', 'global'],
    ['/crm/catalog/products/native-42', 'GET', 'global'],
    ['/crm/catalog/products', 'POST', 'global'], ['/auth/me', 'POST', 'global'],
    ['/crm/conversations/55/messages', 'POST', 'crm-send'],
    ['/crm/inbox?limit=100&offset=0', 'GET', 'crm-read'],
    ['/crm/conversations/55', 'GET', 'crm-read'],
    ['/crm/conversations/55/messages', 'GET', 'global'],
    ['/auth/login/extra', 'POST', 'global'],
  ]) assert.equal(requestBudgetScope(path, method), expected);
});

test('trusted catalog cooldown affects that actor and budget only, never queues a mutation', async () => {
  let time = 1000, calls = 0;
  const control = createRequestControl({now: () => time});
  const catalog = {actor:'a',scope:'catalog'};
  const ok = async () => { calls++; return new Response('ok'); };
  await assert.rejects(control.run('photo', async () => new Response('', {status:429,headers:{'Retry-After':'30','X-CRM-RateLimit-Scope':'catalog'}}), false, catalog), {status:429});
  await assert.rejects(control.run('products', ok, true, catalog), {status:429,retryAfterMs:30000});
  for (const options of [{actor:'a',scope:'global'}, {actor:'a',scope:'verification'}, {actor:'b',scope:'catalog'}]) await control.run('manual', ok, false, options);
  assert.equal(calls,3);
  time += 30000;
  assert.equal(calls,3);
  await control.run('products', ok, true, catalog);assert.equal(calls,4);
});

test('missing, unknown, global or mismatched server scopes fail closed across actors and domains', async () => {
  for (const header of [null,'unknown','global','verification']) {
    const control=createRequestControl({now:()=>1000});let calls=0;
    const headers={'Retry-After':'30',...(header?{'X-CRM-RateLimit-Scope':header}:{})};
    await assert.rejects(control.run('catalog',async()=>new Response('',{status:429,headers}),false,{actor:'a',scope:'catalog'}),{status:429});
    await assert.rejects(control.run('send',async()=>{calls++;return new Response('ok');},false,{actor:'b',scope:'global'}),{status:429});
    assert.equal(calls,0);
  }
});

test('translation and login scoped limits preserve unrelated manual actions and do not retry themselves', async () => {
  for(const scope of ['translation','login','verification','crm-read','crm-send']){
    const control=createRequestControl({now:()=>1000});let calls=0;
    await assert.rejects(control.run('action',async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'10','X-CRM-RateLimit-Scope':scope}});},false,{actor:'a',scope}),{status:429});
    await assert.rejects(control.run('action',async()=>{calls++;return new Response('ok');},false,{actor:'a',scope}),{status:429});
    await control.run('send',async()=>new Response('ok'),false,{actor:'a',scope:'global'});
    assert.equal(calls,1);
  }
});

test('parallel limits preserve the longest confirmed cooldown and scoped reads cannot mix actors or budgets', async () => {
  const control=createRequestControl({now:()=>1000});let short,long;
  const options={actor:'a',scope:'catalog'};
  const first=control.run('one',()=>new Promise(r=>{short=r;}),false,options);
  const second=control.run('two',()=>new Promise(r=>{long=r;}),false,options);
  const rejectedFirst=assert.rejects(first,{status:429}),rejectedSecond=assert.rejects(second,{status:429});
  long(new Response('',{status:429,headers:{'Retry-After':'50','X-CRM-RateLimit-Scope':'catalog'}}));await rejectedSecond;
  short(new Response('',{status:429,headers:{'Retry-After':'10','X-CRM-RateLimit-Scope':'catalog'}}));await rejectedFirst;
  await assert.rejects(control.run('next',async()=>new Response('ok'),false,options),{retryAfterMs:50000});
  let calls=0;const operation=async()=>{calls++;return Response.json({});};
  await Promise.all([control.run('same',operation,true,{actor:'b',scope:'catalog'}),control.run('same',operation,true,{actor:'b',scope:'verification'}),control.run('same',operation,true,{actor:'c',scope:'catalog'})]);
  assert.equal(calls,3);
});

test('expired cooldowns are pruned on unrelated requests across repeatedly replaced actors', async () => {
  let time=1000;
  const control=createRequestControl({now:()=>time});
  for(let actor=0;actor<MAX_SCOPED_COOLDOWNS*2;actor++){
    await assert.rejects(control.run('read',async()=>new Response('',{status:429,headers:{'Retry-After':'1','X-CRM-RateLimit-Scope':'catalog'}}),false,{actor:`synthetic-${actor}`,scope:'catalog'}),{status:429});
    time+=1000;
    await control.run('manual',async()=>new Response('ok'),false,{actor:'unrelated',scope:'crm-send'});
  }
});

test('capacity overflow fails closed globally and never evicts an unexpired actor cooldown', async () => {
  let time=1000,calls=0;
  const control=createRequestControl({now:()=>time});
  const limitedResponse=seconds=>async()=>new Response('',{status:429,headers:{'Retry-After':String(seconds),'X-CRM-RateLimit-Scope':'catalog'}});
  for(let actor=0;actor<MAX_SCOPED_COOLDOWNS;actor++)await assert.rejects(control.run('read',limitedResponse(120),false,{actor:`synthetic-${actor}`,scope:'catalog'}),{status:429});
  await assert.rejects(control.run('overflow',limitedResponse(1),false,{actor:'overflow',scope:'catalog'}),{status:429});
  const operation=async()=>{calls++;return new Response('ok');};
  await assert.rejects(control.run('send',operation,false,{actor:'other',scope:'crm-send'}),{status:429});
  time+=1001;
  await control.run('send',operation,false,{actor:'other',scope:'crm-send'});
  await assert.rejects(control.run('read',operation,false,{actor:'synthetic-0',scope:'catalog'}),{status:429});
  assert.equal(calls,1,'overflow must not remove the existing longer actor cooldown');
});
