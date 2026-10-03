import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import {
  listChatwootInboxOverview,
  mapChatwootMessage,
  normalizeChatwootMessageDirection,
} from './chatwootInboxService.js';

test('message_type 0 is incoming', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 0 }), 'incoming');
});

test('message_type 1 is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 1 }), 'outgoing');
});

test('string message_type 1 is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: '1' }), 'outgoing');
});

test('User sender is outgoing when message type is absent', () => {
  assert.equal(normalizeChatwootMessageDirection({ sender: { type: 'User' } }), 'outgoing');
});

test('Contact sender is incoming when message type is absent', () => {
  assert.equal(normalizeChatwootMessageDirection({ sender: { type: 'Contact' } }), 'incoming');
});

test('incoming and outgoing photos preserve blank text and attachments', () => {
  const attachment = {
    id: 7, file_type: 'image', content_type: 'image/jpeg',
    data_url: 'https://chatwoot.local/image.jpg', thumb_url: 'https://chatwoot.local/thumb.jpg',
  };
  const incoming = mapChatwootMessage({ id: 1, message_type: 0, content: '', attachments: [attachment] });
  const outgoing = mapChatwootMessage({ id: 2, message_type: 1, content: '', attachments: [attachment] });
  assert.equal(incoming.direction, 'incoming');
  assert.equal(outgoing.direction, 'outgoing');
  assert.equal(incoming.text, '');
  assert.equal(outgoing.text, '');
  assert.equal(incoming.attachments.length, 1);
  assert.equal(outgoing.attachments.length, 1);
  assert.equal(incoming.imageUrl, attachment.data_url);
  assert.equal(outgoing.thumbnailUrl, attachment.thumb_url);
});

test('official message type wins when direction indicators conflict', () => {
  assert.equal(normalizeChatwootMessageDirection({
    message_type: 0,
    sender: { type: 'User' },
    is_outgoing: true,
  }), 'incoming');
});

test('missing direction fields fall back safely to incoming', () => {
  assert.equal(normalizeChatwootMessageDirection({}), 'incoming');
});

test('activity is excluded and template is outgoing', () => {
  assert.equal(normalizeChatwootMessageDirection({ message_type: 2, sender: { type: 'User' } }), null);
  assert.equal(normalizeChatwootMessageDirection({ message_type: 3 }), 'outgoing');
});

test('Chatwoot inbox is mapped to the safe CRM read model', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = {
    ...env.chatwoot,
    agentPersonnelMap: new Map(env.chatwoot.agentPersonnelMap),
  };
  const originalWhatsapp = { ...env.whatsapp };
  const calls = [];

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.agentPersonnelMap = new Map([[7, 19]]);
  env.whatsapp.provider = 'evolution';
  env.whatsapp.sendEnabled = false;

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith('/conversations?status=all&page=1')) {
      return new Response(JSON.stringify({
        data: {
          meta: { all_count: 1 },
          payload: [{
            id: 41,
            inbox_id: 1,
            status: 'open',
            unread_count: 2,
            last_activity_at: 1_720_000_000,
            labels: ['musteri'],
            custom_attributes: { melisa_stage: 'Teklif' },
            meta: {
              sender: { name: 'Test Musteri', phone_number: '+38640111222', identifier: '38640111222@s.whatsapp.net' },
              assignee: { id: 19, name: 'Ahmet' },
              team: { id: 3, name: 'Slovenya' },
            },
          }],
        },
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      payload: [{
        id: 90,
        content: 'Merhaba',
        message_type: 0,
        created_at: 1_720_000_000,
        status: 'sent',
        attachments: [{
          id: 501,
          file_type: 'image',
          content_type: 'image/jpeg',
          data_url: 'https://chatwoot.local/rails/active_storage/blobs/image.jpg',
          thumb_url: 'https://chatwoot.local/rails/active_storage/representations/image.jpg',
          file_size: 12345,
          width: 640,
          height: 480,
        }, {
          id: 502,
          file_type: 'file',
          content_type: 'application/pdf',
          data_url: 'https://chatwoot.local/rails/active_storage/blobs/document.pdf',
          fallback_title: 'document.pdf',
          file_size: 67890,
        }],
      }, {
        id: 91,
        content: 'CRM notu: Fiyat bekliyor',
        message_type: 1,
        private: true,
        created_at: 1_720_000_100,
        content_attributes: { melisa_crm: { type: 'note', data: { note: 'Fiyat bekliyor' } } },
        attachments: [],
      }],
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview({ limit: 25, offset: 0 });
    assert.equal(result.summary.source, 'chatwoot-crm');
    assert.equal(result.conversations.length, 1);
    assert.equal(result.conversations[0].assignedUserId, 7);
    assert.equal(result.conversations[0].phoneIdentity.countryCode, 'SI');
    assert.equal(result.conversations[0].messages[0].direction, 'incoming');
    assert.equal(result.conversations[0].messages[0].messageType, 'incoming');
    assert.equal(result.conversations[0].messages[0].senderType, '');
    assert.equal(result.conversations[0].messages[0].createdAt, '2024-07-03T09:46:40.000Z');
    assert.equal(result.conversations[0].messages[0].type, 'image');
    assert.equal(result.conversations[0].messages[0].imageUrl, 'https://chatwoot.local/rails/active_storage/blobs/image.jpg');
    assert.equal(result.conversations[0].messages[0].attachments.length, 2);
    assert.equal(result.conversations[0].messages[0].attachments[0].file_type, 'image');
    assert.equal(result.conversations[0].messages[0].attachments[1].file_name, 'document.pdf');
    assert.equal(result.conversations[0].messages.length, 1);
    assert.equal(result.conversations[0].notes, 'Fiyat bekliyor');
    assert.equal(result.conversations[0].capabilities.assign, true);
    assert.equal(result.conversations[0].capabilities.send, false);
    assert.equal(result.conversations[0].capabilities.localWorkflow, false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers.api_access_token, 'test-token');
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
    Object.assign(env.whatsapp, originalWhatsapp);
  }
});

test('Chatwoot inbox can return more than one internal 25-row page', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.includeGroups = false;

  const conversations = Array.from({ length: 27 }, (_, index) => ({
    id: index + 1,
    inbox_id: 1,
    status: index >= 24 ? 'open' : 'resolved',
    meta: { sender: { phone_number: `+90530000${String(index).padStart(4, '0')}` } },
  }));

  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    const page = Number(new URL(text).searchParams.get('page') || 1);
    const start = (page - 1) * 25;
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: conversations.length },
        payload: conversations.slice(start, start + 25),
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview({ limit: 50, offset: 0 });
    assert.equal(result.conversations.length, 27);
    assert.equal(result.pagination.total, 27);
    assert.equal(result.summary.open, 3);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

test('Chatwoot inbox enables send only after guarded live approval', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  const originalWhatsapp = { ...env.whatsapp };

  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token';
  env.whatsapp.provider = 'chatwoot';
  env.whatsapp.sendEnabled = true;
  env.whatsapp.testNumberOnly = false;
  env.whatsapp.liveSendApproved = true;

  global.fetch = async (url) => {
    if (String(url).includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: 1 },
        payload: [{ id: 51, inbox_id: 1, status: 'open', meta: { sender: { phone_number: '+905301112233' } } }],
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.capabilities.send, true);
    assert.equal(result.conversations[0].capabilities.send, true);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
    Object.assign(env.whatsapp, originalWhatsapp);
  }
});

test('Chatwoot inbox ignores conversations from other inboxes', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 9;
  env.chatwoot.apiAccessToken = 'test-token';

  global.fetch = async () => new Response(JSON.stringify({
    data: {
      meta: { all_count: 1 },
      payload: [{ id: 8, inbox_id: 3, meta: {}, messages: [] }],
    },
  }), { status: 200 });

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.conversations.length, 0);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});

test('Chatwoot customer inbox hides group conversations by default', async () => {
  const originalFetch = global.fetch;
  const originalChatwoot = { ...env.chatwoot };
  env.chatwoot.baseUrl = 'http://chatwoot.local';
  env.chatwoot.accountId = 2;
  env.chatwoot.inboxId = 1;
  env.chatwoot.apiAccessToken = 'test-token';
  env.chatwoot.includeGroups = false;

  global.fetch = async (url) => {
    if (String(url).includes('/messages')) {
      return new Response(JSON.stringify({ payload: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: {
        meta: { all_count: 2 },
        payload: [
          { id: 1, inbox_id: 1, status: 'open', unread_count: 1, meta: { sender: { name: 'Satis Grubu (GROUP)', identifier: '120363@g.us' } } },
          { id: 2, inbox_id: 1, status: 'open', unread_count: 2, meta: { sender: { name: 'Musteri', phone_number: '+905301112233' } } },
        ],
      },
    }), { status: 200 });
  };

  try {
    const result = await listChatwootInboxOverview();
    assert.equal(result.conversations.length, 1);
    assert.equal(result.conversations[0].id, 2);
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.unread, 2);
  } finally {
    global.fetch = originalFetch;
    Object.assign(env.chatwoot, originalChatwoot);
  }
});
