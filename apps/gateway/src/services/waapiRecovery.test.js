import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WaapiJournal } from './waapiJournal.js';
import { WaapiChatwootBridge, createWaapiWorker } from './waapiChatwootBridge.js';
import { normalizeWaapiMedia } from './waapiWebhookService.js';
import { validMediaBytes } from '../utils/validMediaFixtures.js';
const event = { instanceId: '105185', event: 'message', providerMessageId: 'false_19999999999@c.us_SYNTHETIC', phone: '19999999999', direction: 'incoming', text: 'synthetic caption', timestamp: 1780000000, media: null, mediaPending: true };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'messaging-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, journal: new WaapiJournal(root) };
}
test('duplicate later inline media hydrates durable pending message after reopen without a second event', async t => {
  const { journal, root } = await fixture(t);
  await journal.accept(event);
  const media = normalizeWaapiMedia({ mimetype: 'application/pdf', data: validMediaBytes('application/pdf').toString('base64'), filename: 'sample.pdf' });
  const reopened = new WaapiJournal(root);
  const result = await reopened.accept({ ...event, mediaPending: false, media });
  assert.equal(result.duplicate, true); assert.equal(result.mediaHydrated, true);
  const pending = await reopened.pending('105185');
  assert.equal(pending.length, 1); assert.equal(pending[0].event.mediaPending, false);
  assert.deepEqual(pending[0].event.media, media);
  assert.equal((await reopened.accept({ ...event, media })).mediaHydrated, undefined);
});
test('conflicting duplicate hydration cannot replace original text or bytes', async t => {
  const { journal } = await fixture(t); await journal.accept(event);
  await assert.rejects(journal.accept({ ...event, text: 'changed', media: { data: 'YQ==' } }), e => e.code.endsWith('EVENT_CONFLICT'));
  assert.equal((await journal.pending('105185'))[0].event.media, null);
});
test('parallel inbound duplicates stay one record; batch is chronological before limit', async t => {
  const { journal, root } = await fixture(t);
  await Promise.all(Array.from({ length: 12 }, () => new WaapiJournal(root).accept(event)));
  assert.equal((await journal.pending('105185')).length, 1);
  const key = journal.key('105185:message:' + event.providerMessageId + ':');
  await journal.update('events', key, current => ({ ...current, done: true }));
  for (let i = 0; i < 101; i++) await journal.put('events', journal.key('order-' + i), {
    event: { ...event, providerMessageId: 'order-' + i, timestamp: 1780000000 + 100 - i }, done: false,
    receivedAt: new Date(1781000000000 + i).toISOString(),
  });
  const pending = await journal.pending('105185');
  assert.equal(pending.length, 100); assert.equal(pending[0].event.providerMessageId, 'order-100');
  assert.equal(pending.at(-1).event.providerMessageId, 'order-1');
});
test('concurrent ACK updates cannot regress receipt evidence across journal objects', async t => {
  const { journal, root } = await fixture(t);
  const config = { waapi: { bridgeEnabled: true }, chatwoot: { accountId: 2, inboxId: 1 } };
  const bridges = [journal, new WaapiJournal(root)].map(j => new WaapiChatwootBridge({ journal: j, config, request: async () => { throw new Error('ACK must not access Chatwoot'); } }));
  await Promise.all([3,1,2,0,4,1].map((ack, i) => bridges[i % 2].process({ ...event, event: 'message_ack', ack })));
  assert.equal((await journal.get('state', journal.key('ack:' + event.providerMessageId))).ack, 4);
});
function worker(journal, bridge, clock) {
  let tick;
  const stop = createWaapiWorker({ journal, bridge, now: () => clock.value,
    config: { whatsapp: { provider: 'waapi' }, waapi: { bridgeEnabled: true } },
    setIntervalFn: callback => { tick = callback; return { unref() {} }; }, clearIntervalFn: () => {} });
  return { tick: () => tick(), stop };
}
test('retry counters persist after reopen, future checks wait and delay caps at 15 minutes', async t => {
  const { journal, root } = await fixture(t); await journal.accept({ ...event, mediaPending: false });
  const clock = { value: Date.now() }; let checks = 0;
  const bridge = { process: async () => { checks++; throw Object.assign(new Error('synthetic unavailable'), { code: 'WHATSAPP_CRM_WAAPI_IMPORT_UNCONFIRMED' }); } };
  let current = worker(journal, bridge, clock); await current.tick(); current.stop();
  let stored = (await journal.pending('105185'))[0];
  assert.equal(stored, undefined);
  const key = journal.key('105185:message:' + event.providerMessageId + ':');
  stored = await journal.get('events', key);
  assert.equal(stored.retryCount, 1); assert.equal(stored.attemptCount, 1);
  assert.equal(Date.parse(stored.retryAt) - clock.value, 60000);
  current = worker(new WaapiJournal(root), bridge, clock); await current.tick(); assert.equal(checks, 1);
  for (let i = 2; i <= 7; i++) {
    await journal.update('events', key, value => ({ ...value, retryAt: new Date(Date.now() - 1).toISOString() }));
    await current.tick(); stored = await journal.get('events', key);
    assert.equal(stored.retryCount, i); assert.equal(stored.attemptCount, i);
    assert.equal(Date.parse(stored.retryAt) - clock.value, Math.min(60000 * 2 ** Math.min(i - 1, 4), 900000));
  }
  current.stop();
});
test('hydration during failed worker check is preserved and immediately eligible', async t => {
  const { journal } = await fixture(t); await journal.accept(event);
  const media = { mimeType: 'image/png', data: 'YQ==', fileName: 'a.png', byteLength: 1 };
  const current = worker(journal, { process: async () => {
    await journal.accept({ ...event, mediaPending: false, media });
    throw Object.assign(new Error('old pending snapshot'), { code: 'WHATSAPP_CRM_WAAPI_MEDIA_PENDING' });
  } }, { value: Date.now() });
  await current.tick(); current.stop();
  const pending = await journal.pending('105185');
  assert.equal(pending.length, 1); assert.deepEqual(pending[0].event.media, media);
  assert.equal(pending[0].retryAt, null); assert.equal(pending[0].retryCount, 1);
});
test('ambiguous import survives bridge restart and recovers by read proof without a second POST', async t => {
  const { journal, root } = await fixture(t); let posts = 0; let visible = false;
  const request = async (url, options = {}) => {
    if (url === '/inboxes/1') return { id: 1, channel_type: 'Channel::Api' };
    if (url === '/webhooks') return { payload: { webhooks: [] } };
    if (url === '/automation_rules') return { payload: [] };
    if (url === '/inboxes/1/agent_bot') return null;
    if (url === '/conversations/55') return { id: 55, inbox_id: 1, meta: { sender: { phone_number: '+19999999999' } } };
    if (options.method === 'POST') { posts++; throw new Error('synthetic lost response'); }
    if (url.startsWith('/conversations/55/messages')) return { payload: visible ? [{ id: 12, source_id: event.providerMessageId }] : [] };
    throw new Error('unexpected synthetic path');
  };
  const config = { waapi: { bridgeEnabled: true }, chatwoot: { accountId: 2, inboxId: 1 } };
  await assert.rejects(new WaapiChatwootBridge({ journal, request, config }).sync({ ...event, mediaPending: false }, 55));
  const reopened = new WaapiChatwootBridge({ journal: new WaapiJournal(root), request, config });
  await assert.rejects(reopened.sync({ ...event, mediaPending: false }, 55), /IMPORT_UNCONFIRMED/);
  visible = true;
  assert.equal((await reopened.sync({ ...event, mediaPending: false }, 55)).confirmed, true);
  assert.equal(posts, 1);
});
