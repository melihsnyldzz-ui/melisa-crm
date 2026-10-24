import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { chatwootApiRequest } from './chatwootApiService.js';
import { getChatwootConversationDetail } from './chatwootInboxService.js';
import { validMediaBytes } from '../utils/validMediaFixtures.js';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function config(t) {
  const original = { chatwoot: { ...env.chatwoot }, whatsapp: { ...env.whatsapp }, fetch: globalThis.fetch };
  t.after(() => { Object.assign(env.chatwoot, original.chatwoot); Object.assign(env.whatsapp, original.whatsapp); globalThis.fetch = original.fetch; });
  Object.assign(env.chatwoot, { baseUrl: 'https://offline-chatwoot.invalid', accountId: 2, inboxId: 1, apiAccessToken: 'synthetic-fixture-token' });
  env.whatsapp.provider = 'evolution'; env.whatsapp.sendEnabled = false;
}
test('Chatwoot multipart attachment preserves original bytes, filename and caption in one import', async t => {
  config(t);
  const bytes = validMediaBytes('image/png'); let posts = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://offline-chatwoot.invalid/api/v1/accounts/2/conversations/55/messages');
    assert.equal(options.method, 'POST'); posts++;
    assert.equal(options.headers['Content-Type'], undefined);
    assert(options.body instanceof FormData);
    const file = options.body.get('attachments[]');
    assert.equal(file.name, 'synthetic.png'); assert.equal(file.type, 'image/png'); assert.equal(file.size, bytes.length);
    assert.equal(digest(Buffer.from(await file.arrayBuffer())), digest(bytes));
    assert.equal(options.body.get('content'), 'synthetic caption');
    assert.equal(options.body.get('source_id'), 'synthetic-provider-id');
    return new Response(JSON.stringify({ id: 123 }));
  };
  await chatwootApiRequest('/conversations/55/messages', { method: 'POST',
    body: { content: 'synthetic caption', source_id: 'synthetic-provider-id', message_type: 'incoming', private: false },
    media: { mimeType: 'image/png', data: bytes.toString('base64'), fileName: 'synthetic.png' } });
  assert.equal(posts, 1);
});
test('CRM timeline orders the bounded latest 20-message page by provider time despite import order', async t => {
  config(t);
  globalThis.fetch = async url => {
    if (url.endsWith('/conversations/55')) return new Response(JSON.stringify({ id: 55, inbox_id: 1,
      status: 'open', meta: { sender: { phone_number: '+19999999999' }, assignee: null } }));
    assert(url.endsWith('/conversations/55/messages'));
    // The latest Chatwoot page contains at most 20 raw rows. Oversized-page
    // rejection is covered separately by chatwootInboxService.test.js.
    return new Response(JSON.stringify({ payload: Array.from({ length: 20 }, (_,i) => ({
      id: 100 + i, message_type: 0, content: 'synthetic-' + i, created_at: 1790000000 + i,
      content_attributes: { provider: 'waapi', provider_timestamp: 1780000000 + 24 - i },
      attachments: [{ id: i, file_type: 'file', content_type: 'application/pdf', data_url: 'https://offline-chatwoot.invalid/synthetic.pdf', file_size: i + 1 }],
    })) }));
  };
  const result = await getChatwootConversationDetail({ conversationId: 55, user: { role: 'patron', permissions: ['crm.view'] } });
  assert.equal(result.messages.length, 20);
  assert.deepEqual(result.messages.map(m => m.id), Array.from({ length: 20 }, (_,i) => 119 - i));
  assert.equal(result.messages[0].createdAt, new Date(1780000005 * 1000).toISOString());
  assert.equal(result.messages.at(-1).attachments[0].file_size, 1);
});
