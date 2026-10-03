import { env } from '../config/env.js';
import { WhatsAppProvider } from './whatsappProvider.js';

function providerError(code, message, statusCode = 502, meta = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (meta) error.meta = meta;
  return error;
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return { raw: await response.text().catch(() => '') };
  }
}

function dataUrlToBlob(dataUrl, fallbackMimeType) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!match) {
    throw providerError('WHATSAPP_CRM_MEDIA_INVALID', 'Chatwoot dosya verisi gecersiz.', 400);
  }

  return new Blob([Buffer.from(match[2], 'base64')], {
    type: match[1] || fallbackMimeType || 'application/octet-stream',
  });
}

export class ChatwootProvider extends WhatsAppProvider {
  constructor() {
    super('chatwoot');
  }

  async sendMessage({ conversationId, phone, text, media } = {}) {
    const numericConversationId = String(conversationId || '').trim();
    if (!/^\d+$/.test(numericConversationId)) {
      throw providerError(
        'WHATSAPP_CRM_CHATWOOT_CONVERSATION_REQUIRED',
        'Chatwoot konusma kimligi zorunludur.',
        400,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.chatwoot.timeoutMs);
    const endpoint = `${env.chatwoot.baseUrl}/api/v1/accounts/${env.chatwoot.accountId}`
      + `/conversations/${numericConversationId}/messages`;
    const hasMedia = Boolean(media?.dataUrl);
    let transportAttempted = false;

    try {
      let body;
      let headers = { api_access_token: env.chatwoot.apiAccessToken };

      if (hasMedia) {
        body = new FormData();
        body.set('content', String(text || ''));
        body.set('message_type', 'outgoing');
        body.set('private', 'false');
        body.append(
          'attachments[]',
          dataUrlToBlob(media.dataUrl, media.mimeType),
          media.fileName || 'catalog.pdf',
        );
      } else {
        headers = { ...headers, 'Content-Type': 'application/json' };
        body = JSON.stringify({
          content: String(text || ''),
          message_type: 'outgoing',
          private: false,
          content_type: 'text',
        });
      }

      transportAttempted = true;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw providerError(
          'WHATSAPP_CRM_CHATWOOT_SEND_FAILED',
          `Chatwoot gonderimi reddetti (HTTP ${response.status}).`,
          response.status === 401 || response.status === 403 ? 503 : 502,
          { status: response.status, providerCode: 'CHATWOOT_REJECTED', transportAttempted: true },
        );
      }

      return {
        provider: this.providerName,
        instanceKey: `chatwoot-account-${env.chatwoot.accountId}`,
        phone: String(phone || ''),
        text: String(text || ''),
        messageType: hasMedia ? (String(media.mimeType || '').startsWith('image/') ? 'image' : 'file') : 'text',
        media: hasMedia ? media : null,
        providerMessageId: payload?.id ? String(payload.id) : null,
        providerResponse: payload,
        sentAt: payload?.created_at
          ? new Date(Number(payload.created_at) * 1000).toISOString()
          : new Date().toISOString(),
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw providerError(
          'WHATSAPP_CRM_CHATWOOT_TIMEOUT',
          'Chatwoot yanit vermedi; teslim durumu dogrulanamadi.',
          504,
          { providerCode: 'CHATWOOT_TIMEOUT', transportAttempted },
        );
      }
      if (!error?.code) {
        throw providerError(
          'WHATSAPP_CRM_CHATWOOT_NETWORK_FAILED',
          'Chatwoot baglantisi tamamlanamadi; teslim durumu dogrulanamadi.',
          502,
          { providerCode: error?.name || 'NETWORK_ERROR', transportAttempted },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
