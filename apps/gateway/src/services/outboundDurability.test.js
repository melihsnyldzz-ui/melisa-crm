import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisOutboundAttemptStore } from './outboundAttemptService.js';
function fixture() {
  const records = new Map(); const sets = [];
  const client = {
    set: async (key, value, ...args) => {
      sets.push(args);
      if (args.includes('NX') && records.has(key)) return null;
      if (args.includes('XX') && !records.has(key)) return null;
      records.set(key, value); return 'OK';
    },
    get: async key => records.get(key) || null,
    pttl: async () => -1,
  };
  return { records, sets, client, store: () => createRedisOutboundAttemptStore(work => work(client)) };
}
const input = { clientRequestId: 'SYNTHETIC-DURABLE-001', fingerprint: 'synthetic-fingerprint', conversationId: '55', provider: 'waapi' };
test('Redis WAAPI NX lock has no TTL and confirmed state survives reconstructed application store', async () => {
  const f = fixture();
  assert.equal((await f.store().begin(input)).created, true);
  await f.store().update(input.clientRequestId, { state: 'CONFIRMED', providerMessageId: 'synthetic-id', chatwootMessageId: '123' });
  const replay = await f.store().begin(input);
  assert.equal(replay.created, false); assert.equal(replay.attempt.state, 'CONFIRMED');
  assert.equal(replay.attempt.providerMessageId, 'synthetic-id');
  assert(f.sets.every(args => !args.includes('PX')));
  await assert.rejects(f.store().begin({ ...input, fingerprint: 'different-bytes-or-actor' }), e => e.code.endsWith('IDEMPOTENCY_CONFLICT'));
});
test('concurrent same Redis key has one winner and preserves PENDING and ambiguous locks on reopen', async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 16 }, () => f.store().begin(input)));
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal((await f.store().begin(input)).attempt.state, 'PENDING');
  await f.store().update(input.clientRequestId, { state: 'UNCONFIRMED_NO_RETRY' });
  assert.equal((await f.store().begin(input)).attempt.state, 'UNCONFIRMED_NO_RETRY');
});
test('Redis rejected XX update cannot report durable success', async () => {
  const f = fixture(); await f.store().begin(input);
  f.client.set = async () => null;
  await assert.rejects(f.store().update(input.clientRequestId, { state: 'CONFIRMED' }), e => e.code.endsWith('IDEMPOTENCY_UNAVAILABLE'));
});
test('Redis NX record missing on failed create fails closed', async () => {
  const store = createRedisOutboundAttemptStore(work => work({ set: async () => null, get: async () => null }));
  await assert.rejects(store.begin(input), e => e.code.endsWith('IDEMPOTENCY_UNAVAILABLE'));
});
