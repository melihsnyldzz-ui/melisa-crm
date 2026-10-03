import test from "node:test";
import assert from "node:assert/strict";
import { createRequestControl, POLL_INTERVAL } from "../src/requestControl.js";

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
