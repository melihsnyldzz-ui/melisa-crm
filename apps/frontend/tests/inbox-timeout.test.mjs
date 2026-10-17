import test from 'node:test';
import assert from 'node:assert/strict';
import { liveApi } from '../src/liveApi.js';

function pendingFetch(t, delay) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, options) => {
    calls.push({ url, options });
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
      if (delay !== undefined) setTimeout(() => {
        options.signal.removeEventListener('abort', abort);
        resolve(Response.json({ success: true, data: { conversations: [], summary: { total: 498 } } }));
      }, delay);
    });
  });
  return calls;
}

test('a later inbox page survives the observed 23-second response with one read', async t => {
  const calls = pendingFetch(t, 23000);
  const result = liveApi.inbox('synthetic-slow-inbox', 100);
  t.mock.timers.tick(20000);
  assert.equal(calls[0].options.signal.aborted, false);
  t.mock.timers.tick(3000);
  await result;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/live/crm/inbox?limit=100&offset=100');
  assert.equal(calls[0].options.method, undefined);
});

test('inbox still times out at 45 seconds without retrying', async t => {
  const calls = pendingFetch(t);
  const rejected = assert.rejects(liveApi.inbox('synthetic-bounded-inbox'), { code: 'CRM_REQUEST_TIMEOUT' });
  t.mock.timers.tick(44999);
  assert.equal(calls[0].options.signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls.length, 1);
});

test('caller cancellation interrupts the longer inbox read immediately', async t => {
  const calls = pendingFetch(t);
  const caller = new AbortController();
  const rejected = assert.rejects(liveApi.inbox('synthetic-cancel-inbox', 100, { signal: caller.signal }), { name: 'AbortError' });
  t.mock.timers.tick(1000);
  caller.abort();
  await rejected;
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls.length, 1);
});

test('session reads retain the original 20-second timeout', async t => {
  const calls = pendingFetch(t);
  const rejected = assert.rejects(liveApi.session('synthetic-session-budget'), { code: 'CRM_REQUEST_TIMEOUT' });
  t.mock.timers.tick(19999);
  assert.equal(calls[0].options.signal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(calls.length, 1);
});
