import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { EvolutionProvider } from './evolutionProvider.js';

const provider = new EvolutionProvider();

function normalize(message, extraData = {}) {
  return provider.normalizeWebhook({
    instance: 'melisa-test',
    event: 'messages.upsert',
    data: {
      key: message.key,
      pushName: message.pushName,
      messageType: message.messageType,
      message,
      ...extraData,
    },
  });
}

test('keeps normal conversation text unchanged', () => {
  const event = normalize({
    key: {
      id: 'text-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    message: {
      conversation: 'test',
    },
  });

  assert.equal(event.text, 'test');
  assert.equal(event.phone, '905551112233');
});

test('does not treat Evolution sender field as contact phone for inbound LID messages', () => {
  const event = provider.normalizeWebhook({
    instance: 'melisa-test',
    event: 'messages.upsert',
    sender: '19999999999@s.whatsapp.net',
    data: {
      key: {
        id: 'lid-inbound-1',
        remoteJid: '222530946265208@lid',
        fromMe: false,
      },
      pushName: 'Beyza',
      message: {
        conversation: 'merhaba',
      },
      messageType: 'conversation',
    },
  });

  assert.equal(event.remoteJid, '222530946265208@lid');
  assert.equal(event.phone, '222530946265208');
  assert.equal(event.text, 'merhaba');
});

test('uses media captions before fallback previews', () => {
  const event = normalize({
    key: {
      id: 'image-caption-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    messageType: 'imageMessage',
    message: {
      imageMessage: {
        caption: 'urun gorseli',
      },
    },
  });

  assert.equal(event.text, 'urun gorseli');
});

test('normalizes image media metadata for CRM rendering', () => {
  const event = normalize({
    key: {
      id: 'image-media-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    messageType: 'imageMessage',
    message: {
      imageMessage: {
        caption: 'urun gorseli',
        mimetype: 'image/jpeg',
        jpegThumbnail: 'aW1hZ2U=',
      },
    },
  });

  assert.equal(event.messageType, 'image');
  assert.equal(event.media.mimeType, 'image/jpeg');
  assert.equal(event.media.thumbnailUrl, 'data:image/jpeg;base64,aW1hZ2U=');
});

test('normalizes Evolution byte-object thumbnails for CRM rendering', () => {
  const event = normalize({
    key: {
      id: 'image-media-byte-thumb-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    messageType: 'imageMessage',
    message: {
      imageMessage: {
        mimetype: 'image/jpeg',
        jpegThumbnail: { 0: 255, 1: 216, 2: 255 },
      },
    },
  });

  assert.equal(event.messageType, 'image');
  assert.equal(event.media.thumbnailUrl, 'data:image/jpeg;base64,/9j/');
});

test('normalizes sticker messages as media payloads', () => {
  const event = normalize({
    key: {
      id: 'sticker-media-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    messageType: 'stickerMessage',
    message: {
      stickerMessage: {
        mimetype: 'image/webp',
      },
    },
  });

  assert.equal(event.messageType, 'sticker');
  assert.equal(event.media.mimeType, 'image/webp');
});

test('creates safe previews for common non-text payloads', () => {
  const cases = [
    [{ imageMessage: {} }, '[Görsel]'],
    [{ videoMessage: {} }, '[Video]'],
    [{ audioMessage: { ptt: true } }, '[Ses]'],
    [{ documentMessage: { fileName: 'teklif.pdf' } }, '[Belge] teklif.pdf'],
    [{ stickerMessage: {} }, '[Çıkartma]'],
    [{ locationMessage: { degreesLatitude: 41.0, degreesLongitude: 29.0 } }, '[Konum]'],
    [{ contactMessage: { displayName: 'Ayse Musteri' } }, '[Kişi] Ayse Musteri'],
  ];

  for (const [messageBody, expected] of cases) {
    const event = normalize({
      key: {
        id: `case-${expected}`,
        remoteJid: '905551112233@s.whatsapp.net',
        fromMe: false,
      },
      message: messageBody,
    });

    assert.equal(event.text, expected);
  }
});

test('prefixes group previews with sender name when available', () => {
  const event = normalize({
    key: {
      id: 'group-image-1',
      remoteJid: '120363000000000000@g.us',
      participant: '905559998877@s.whatsapp.net',
      fromMe: false,
    },
    pushName: 'Ali',
    messageType: 'imageMessage',
    message: {
      imageMessage: {},
    },
  });

  assert.equal(event.text, 'Ali: [Görsel]');
  assert.equal(event.phone, '120363000000000000');
});

test('unwraps nested Evolution message wrappers', () => {
  const event = normalize({
    key: {
      id: 'view-once-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    message: {
      viewOnceMessage: {
        message: {
          videoMessage: {},
        },
      },
    },
  });

  assert.equal(event.text, '[Video]');
});

test('falls back to message type when body is not expanded', () => {
  const event = normalize({
    key: {
      id: 'type-only-document-1',
      remoteJid: '905551112233@s.whatsapp.net',
      fromMe: false,
    },
    messageType: 'documentMessage',
    message: {},
  });

  assert.equal(event.text, '[Belge]');
});

test('sends text messages through Evolution sendText endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body),
    });

    return {
      ok: true,
      json: async () => ({ key: { id: 'evo-message-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '0555 111 22 33',
      text: 'Merhaba',
    });

    assert.equal(result.phone, '905551112233');
    assert.equal(result.providerMessageId, 'evo-message-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://evolution.local/message/sendText/melisa-test');
    assert.equal(calls[0].headers.apikey, 'test-key');
    assert.deepEqual(calls[0].body, {
      number: '905551112233',
      text: 'Merhaba',
      textMessage: {
        text: 'Merhaba',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('sends image messages through Evolution sendMedia endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body),
    });

    return {
      ok: true,
      json: async () => ({ key: { id: 'evo-image-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '0555 111 22 33',
      text: 'Resim',
      media: {
        dataUrl: 'data:image/png;base64,aW1hZ2U=',
        mimeType: 'image/png',
        fileName: 'urun.png',
      },
    });

    assert.equal(result.messageType, 'image');
    assert.equal(result.providerMessageId, 'evo-image-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://evolution.local/message/sendMedia/melisa-test');
    assert.equal(calls[0].headers.apikey, 'test-key');
    assert.equal(calls[0].body.number, '905551112233');
    assert.equal(calls[0].body.mediatype, 'image');
    assert.equal(calls[0].body.mimetype, 'image/png');
    assert.equal(calls[0].body.media, 'aW1hZ2U=');
    assert.equal(calls[0].body.fileName, 'urun.png');
    assert.equal(calls[0].body.caption, 'Resim');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('sends PDF messages through Evolution sendMedia document endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body),
    });

    return {
      ok: true,
      json: async () => ({ key: { id: 'evo-pdf-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '0555 111 22 33',
      text: 'Dekont',
      media: {
        dataUrl: 'data:application/pdf;base64,cGRm',
        mediaType: 'document',
        mimeType: 'application/pdf',
        fileName: 'dekont.pdf',
      },
    });

    assert.equal(result.messageType, 'file');
    assert.equal(result.providerMessageId, 'evo-pdf-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://evolution.local/message/sendMedia/melisa-test');
    assert.equal(calls[0].body.number, '905551112233');
    assert.equal(calls[0].body.mediatype, 'document');
    assert.equal(calls[0].body.mimetype, 'application/pdf');
    assert.equal(calls[0].body.media, 'cGRm');
    assert.equal(calls[0].body.fileName, 'dekont.pdf');
    assert.equal(calls[0].body.caption, 'Dekont');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('resolves LID chats to a unique phone contact before sending', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body),
    });

    if (url.endsWith('/chat/findContacts/melisa-test')) {
      return {
        ok: true,
        json: async () => ({
          value: [
            { remoteJid: '51453859229862@lid', pushName: 'Ali Riza Senyildiz' },
            { remoteJid: '905367776306@s.whatsapp.net', pushName: 'ALI RIZA SENYILDIZ' },
          ],
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({ key: { id: 'evo-message-lid-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '51453859229862',
      remoteJid: '51453859229862@lid',
      contactName: 'Ali Rıza ŞENYILDIZ',
      text: 'Merhaba',
    });

    assert.equal(result.phone, '905367776306@s.whatsapp.net');
    assert.equal(result.providerMessageId, 'evo-message-lid-1');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'http://evolution.local/chat/findContacts/melisa-test');
    assert.equal(calls[1].url, 'http://evolution.local/message/sendText/melisa-test');
    assert.equal(calls[1].body.number, '905367776306@s.whatsapp.net');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('uses explicit CRM phone before LID contact resolver', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      body: JSON.parse(options.body),
    });

    return {
      ok: true,
      json: async () => ({ key: { id: 'explicit-phone-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '5394412927',
      remoteJid: '51453859229862@lid',
      contactName: 'Ali Rıza ŞENYILDIZ',
      text: 'Merhaba',
    });

    assert.equal(result.phone, '905394412927');
    assert.equal(result.providerMessageId, 'explicit-phone-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://evolution.local/message/sendText/melisa-test');
    assert.equal(calls[0].body.number, '905394412927');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('does not auto-resolve LID chats on partial name matches', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };
  const calls = [];

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async (url, options) => {
    calls.push({
      url,
      body: JSON.parse(options.body),
    });

    if (url.endsWith('/chat/findContacts/melisa-test')) {
      return {
        ok: true,
        json: async () => ({
          value: [
            { remoteJid: '905367776306@s.whatsapp.net', pushName: 'ALI RIZA ABI SIRKET' },
          ],
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({ key: { id: 'partial-name-1' } }),
    };
  };

  try {
    const result = await provider.sendMessage({
      phone: '51453859229862',
      remoteJid: '51453859229862@lid',
      contactName: 'Ali Rıza ŞENYILDIZ',
      text: 'Merhaba',
    });

    assert.equal(result.phone, '51453859229862@lid');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.number, '51453859229862@lid');
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('reports Evolution send failures without exposing provider response bodies', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    apiUrl: env.evolution.apiUrl,
    apiKey: env.evolution.apiKey,
    instance: env.evolution.instance,
    timeoutMs: env.evolution.timeoutMs,
  };

  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'melisa-test';
  env.evolution.timeoutMs = 1000;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: 'boom' }),
  });

  try {
    await assert.rejects(
      () => provider.sendMessage({ phone: '905551112233', text: 'Merhaba' }),
      (error) => {
        assert.equal(error.code, 'WHATSAPP_CRM_SEND_FAILED');
        assert.equal(error.statusCode, 502);
        assert.match(error.message, /HTTP 500/);
        assert.doesNotMatch(error.message, /boom/);
        assert.equal(error.meta.transportAttempted, true);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});

test('rejects a Chatwoot instance key before contacting Evolution', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = { ...env.evolution };
  let fetchCalled = false;
  env.evolution.apiUrl = 'http://evolution.local';
  env.evolution.apiKey = 'test-key';
  env.evolution.instance = 'sirket-hatti-1';
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('must not call transport');
  };

  try {
    await assert.rejects(
      () => provider.sendMessage({
        phone: '905551112233',
        text: 'Merhaba',
        instanceKey: 'chatwoot-inbox-1',
      }),
      (error) => error.code === 'WHATSAPP_CRM_EVOLUTION_INSTANCE_MISMATCH'
        && error.meta.transportAttempted === false,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(env.evolution, originalConfig);
  }
});
