import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { WhatsAppProvider } from './whatsappProvider.js';

function hashPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload || {}))
    .digest('hex');
}

function getMessage(payload = {}) {
  return payload.data?.message?.key || payload.data?.message?.message
    ? payload.data?.message
    : payload.data
    || payload.data?.messages?.[0]
    || payload.message
    || payload.messages?.[0]
    || null;
}

function getRemoteJid(message = {}, payload = {}) {
  return message.key?.remoteJid
    || message.remoteJid
    || payload.data?.key?.remoteJid
    || payload.remoteJid
    || '';
}

function normalizePhone(remoteJid = '') {
  return String(remoteJid)
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@lid$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/[^\d+]/g, '');
}

function normalizeSendPhone(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');

  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
  return digits;
}

function isExplicitPhoneTarget(value = '') {
  const raw = String(value || '').trim();
  const normalized = normalizeSendPhone(raw);

  if (normalized.length < 10 || normalized.length > 15) return false;
  return raw.startsWith('+') || raw.startsWith('00') || normalized.startsWith('90');
}

function normalizeSendTarget({ phone, remoteJid } = {}) {
  const jid = String(remoteJid || '').trim();
  const normalizedPhone = normalizeSendPhone(phone);

  if (/@lid$/i.test(jid) && isExplicitPhoneTarget(phone)) return normalizedPhone;
  if (/@lid$/i.test(jid)) return jid;
  return normalizedPhone;
}

function normalizeName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStrongNameMatch(sourceName = '', candidateName = '') {
  const normalizedSource = normalizeName(sourceName);
  const normalizedCandidate = normalizeName(candidateName);

  return Boolean(normalizedSource) && normalizedSource === normalizedCandidate;
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return { raw: await response.text().catch(() => '') };
  }
}

function unwrapMessageBody(body = {}) {
  const nestedMessage = body.ephemeralMessage?.message
    || body.viewOnceMessage?.message
    || body.viewOnceMessageV2?.message
    || body.documentWithCaptionMessage?.message
    || body.editedMessage?.message;

  return nestedMessage ? unwrapMessageBody(nestedMessage) : body;
}

function firstText(...values) {
  return values
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function labeledPreview(label, detail) {
  const normalizedDetail = String(detail || '').trim();
  return normalizedDetail ? `${label} ${normalizedDetail}` : label;
}

function getGroupSender(message = {}, payload = {}) {
  return message.pushName
    || payload.data?.pushName
    || payload.pushName
    || normalizePhone(message.key?.participant || message.participant || payload.data?.participant || payload.participant)
    || '';
}

function getContactDisplayName(message = {}, payload = {}) {
  return message.pushName
    || payload.data?.pushName
    || payload.pushName
    || payload.data?.message?.pushName
    || '';
}

function withGroupSender(text, message = {}, payload = {}) {
  const remoteJid = getRemoteJid(message, payload);

  if (!String(remoteJid).endsWith('@g.us')) return text;

  const sender = getGroupSender(message, payload);
  return sender ? `${sender}: ${text}` : text;
}

function mediaPreview(body = {}, message = {}) {
  if (body.imageMessage) return '[Görsel]';
  if (body.videoMessage) return '[Video]';
  if (body.audioMessage) return '[Ses]';
  if (body.documentMessage) return labeledPreview('[Belge]', body.documentMessage.fileName);
  if (body.stickerMessage) return '[Çıkartma]';
  if (body.locationMessage || body.liveLocationMessage) return '[Konum]';
  if (body.contactMessage) return labeledPreview('[Kişi]', body.contactMessage.displayName);
  if (body.contactsArrayMessage) {
    return labeledPreview('[Kişi]', body.contactsArrayMessage.contacts?.[0]?.displayName);
  }

  switch (message.messageType || message.type || body.messageType) {
    case 'imageMessage':
      return '[Görsel]';
    case 'videoMessage':
      return '[Video]';
    case 'audioMessage':
      return '[Ses]';
    case 'documentMessage':
      return '[Belge]';
    case 'stickerMessage':
      return '[Çıkartma]';
    case 'locationMessage':
    case 'liveLocationMessage':
      return '[Konum]';
    case 'contactMessage':
    case 'contactsArrayMessage':
      return '[Kişi]';
    default:
      return '[Mesaj]';
  }
}

function getText(message = {}, payload = {}) {
  const body = unwrapMessageBody(message.message || message);
  const text = firstText(
    body.conversation,
    body.extendedTextMessage?.text,
    body.imageMessage?.caption,
    body.videoMessage?.caption,
    body.documentMessage?.caption,
    message.text,
    payload.data?.text,
  ) || mediaPreview(body, message);

  return withGroupSender(text, message, payload);
}

function getMessageType(message = {}) {
  const body = unwrapMessageBody(message.message || message);

  if (body.imageMessage || message.messageType === 'imageMessage' || message.type === 'imageMessage') return 'image';
  if (body.videoMessage || message.messageType === 'videoMessage' || message.type === 'videoMessage') return 'video';
  if (body.audioMessage || message.messageType === 'audioMessage' || message.type === 'audioMessage') return 'audio';
  if (body.stickerMessage || message.messageType === 'stickerMessage' || message.type === 'stickerMessage') return 'sticker';
  if (body.documentMessage || message.messageType === 'documentMessage' || message.type === 'documentMessage') return 'file';
  return 'text';
}

function normalizeBase64Media(value = '', mimeType = 'image/jpeg') {
  let raw = '';

  if (Array.isArray(value)) {
    raw = Buffer.from(value).toString('base64');
  } else if (value && typeof value === 'object') {
    raw = Buffer.from(Object.values(value).map((item) => Number(item) || 0)).toString('base64');
  } else {
    raw = String(value || '').trim();
  }

  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  return `data:${mimeType || 'image/jpeg'};base64,${raw}`;
}

function getMediaInfo(message = {}) {
  const body = unwrapMessageBody(message.message || message);
  const image = body.imageMessage || {};
  const video = body.videoMessage || {};
  const audio = body.audioMessage || {};
  const document = body.documentMessage || {};
  const sticker = body.stickerMessage || {};
  const media = image.url ? image : video.url ? video : document.url ? document : audio.url ? audio : sticker.url ? sticker : image;
  const mimeType = media.mimetype || image.mimetype || video.mimetype || document.mimetype || audio.mimetype || sticker.mimetype || '';
  const thumbnail = image.jpegThumbnail || video.jpegThumbnail || document.jpegThumbnail || sticker.jpegThumbnail || '';

  return {
    mediaUrl: media.url || '',
    thumbnailUrl: normalizeBase64Media(thumbnail, mimeType || 'image/jpeg'),
    mimeType,
    fileName: document.fileName || media.fileName || '',
    fileSize: media.fileLength || media.fileSize || null,
    caption: image.caption || video.caption || document.caption || '',
  };
}

export class EvolutionProvider extends WhatsAppProvider {
  constructor() {
    super('evolution');
  }

  async findLidSendTarget({ remoteJid, contactName } = {}) {
    const jid = String(remoteJid || '').trim();
    if (!/@lid$/i.test(jid) || !String(contactName || '').trim()) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.evolution.timeoutMs);
    const instance = encodeURIComponent(env.evolution.instance);

    try {
      const response = await fetch(`${env.evolution.apiUrl}/chat/findContacts/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.evolution.apiKey,
        },
        body: JSON.stringify({
          where: {},
          limit: 5000,
        }),
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) return null;

      const contacts = Array.isArray(payload) ? payload : payload?.value;
      if (!Array.isArray(contacts)) return null;

      const candidates = contacts.filter((contact) => (
        /@s\.whatsapp\.net$/i.test(String(contact.remoteJid || ''))
        && isStrongNameMatch(contactName, contact.pushName)
      ));

      return candidates.length === 1 ? candidates[0].remoteJid : null;
    } finally {
      clearTimeout(timeout);
    }
  }

  normalizeWebhook(payload = {}, headers = {}) {
    const message = getMessage(payload) || {};
    const eventType = payload.event || payload.type || payload.data?.event || 'unknown';
    const remoteJid = getRemoteJid(message, payload);
    const messageId = message.key?.id || message.id || payload.data?.id || payload.id || '';
    const eventId = headers['x-evolution-event-id']
      || headers['x-event-id']
      || payload.eventId
      || payload.data?.eventId
      || `${env.evolution.instance}:${eventType}:${messageId || hashPayload(payload)}`;

    const text = getText(message, payload);
    const media = getMediaInfo(message);

    return {
      provider: this.providerName,
      instanceKey: payload.instance || payload.instanceName || env.evolution.instance,
      eventId,
      eventType,
      messageId,
      remoteJid,
      phone: normalizePhone(remoteJid),
      contactName: getContactDisplayName(message, payload),
      direction: message.key?.fromMe ? 'outbound' : 'inbound',
      messageType: getMessageType(message),
      media,
      text,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
    };
  }

  async sendMessage({ phone, remoteJid, contactName, text, media, instanceKey } = {}) {
    const number = normalizeSendTarget({ phone, remoteJid });
    const resolvedTarget = /@lid$/i.test(number)
      ? await this.findLidSendTarget({ remoteJid, contactName })
      : null;
    const sendTarget = resolvedTarget || number;
    const messageText = String(text || '').trim();
    const mediaPayload = media && typeof media === 'object' ? media : null;
    const hasMedia = Boolean(mediaPayload?.dataUrl);

    if (!/@lid$/i.test(sendTarget) && sendTarget.length < 10) {
      const error = new Error('WhatsApp telefon numarasi gecersiz');
      error.code = 'WHATSAPP_CRM_PHONE_INVALID';
      error.statusCode = 400;
      throw error;
    }

    if (!messageText && !hasMedia) {
      const error = new Error('Gonderilecek mesaj bos olamaz');
      error.code = 'WHATSAPP_CRM_MESSAGE_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    const requestedInstance = String(instanceKey || env.evolution.instance).trim();
    if (requestedInstance !== String(env.evolution.instance).trim()) {
      const error = new Error('Gonderim instance degeri yapilandirilmis Evolution instance ile eslesmiyor.');
      error.code = 'WHATSAPP_CRM_EVOLUTION_INSTANCE_MISMATCH';
      error.statusCode = 409;
      error.meta = { transportAttempted: false };
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.evolution.timeoutMs);
    const selectedInstance = String(env.evolution.instance).trim();
    const instance = encodeURIComponent(selectedInstance);
    let transportAttempted = false;

    try {
      const endpoint = hasMedia ? 'sendMedia' : 'sendText';
      const outboundMediaType = mediaPayload?.mediaType || (String(mediaPayload?.mimeType || '').startsWith('image/') ? 'image' : 'document');
      const body = hasMedia ? {
        number: sendTarget,
        mediatype: outboundMediaType,
        mimetype: mediaPayload.mimeType || (outboundMediaType === 'image' ? 'image/jpeg' : 'application/pdf'),
        media: String(mediaPayload.dataUrl).replace(/^data:[^;]+;base64,/, ''),
        fileName: mediaPayload.fileName || (outboundMediaType === 'image' ? 'image.jpg' : 'document.pdf'),
        caption: messageText,
      } : {
        number: sendTarget,
        text: messageText,
        textMessage: {
          text: messageText,
        },
      };

      transportAttempted = true;
      const response = await fetch(`${env.evolution.apiUrl}/message/${endpoint}/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.evolution.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const error = new Error(`Evolution API gonderimi reddetti (HTTP ${response.status}).`);
        error.code = 'WHATSAPP_CRM_SEND_FAILED';
        error.statusCode = 502;
        error.meta = {
          status: response.status,
          providerCode: String(payload?.code || payload?.error || 'EVOLUTION_REJECTED').slice(0, 64),
          transportAttempted: true,
        };
        throw error;
      }

      return {
        provider: this.providerName,
        instanceKey: selectedInstance,
        phone: sendTarget,
        text: messageText,
        messageType: hasMedia ? (outboundMediaType === 'image' ? 'image' : 'file') : 'text',
        media: hasMedia ? {
          mediaUrl: mediaPayload.dataUrl,
          mimeType: mediaPayload.mimeType || (outboundMediaType === 'image' ? 'image/jpeg' : 'application/pdf'),
          fileName: mediaPayload.fileName || (outboundMediaType === 'image' ? 'image.jpg' : 'document.pdf'),
        } : null,
        providerMessageId: payload?.key?.id || payload?.message?.key?.id || payload?.id || null,
        providerResponse: payload,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error?.code) throw error;
      const wrapped = new Error(error?.name === 'AbortError'
        ? 'Evolution API zaman asimina ugradi; teslim durumu dogrulanamadi.'
        : 'Evolution API baglantisi tamamlanamadi; teslim durumu dogrulanamadi.');
      wrapped.code = error?.name === 'AbortError'
        ? 'WHATSAPP_CRM_EVOLUTION_TIMEOUT'
        : 'WHATSAPP_CRM_EVOLUTION_NETWORK_FAILED';
      wrapped.statusCode = error?.name === 'AbortError' ? 504 : 502;
      wrapped.meta = { transportAttempted, providerCode: error?.name || 'NETWORK_ERROR' };
      throw wrapped;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMessageMedia({ rawPayload = {}, instanceKey = env.evolution.instance } = {}) {
    const messagePayload = rawPayload.data?.message || rawPayload.message || {};
    const keyPayload = rawPayload.data?.key || messagePayload.key || rawPayload.key || {};
    const instance = encodeURIComponent(instanceKey || env.evolution.instance);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.evolution.timeoutMs);

    try {
      const response = await fetch(`${env.evolution.apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.evolution.apiKey,
        },
        body: JSON.stringify({
          message: {
            key: keyPayload,
            message: messagePayload,
          },
        }),
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const error = new Error(payload?.message || payload?.error || 'WhatsApp medya dosyasi alinamadi');
        error.code = 'WHATSAPP_CRM_MEDIA_FETCH_FAILED';
        error.statusCode = 502;
        error.meta = { status: response.status };
        throw error;
      }

      const base64 = String(payload?.base64 || payload?.data || payload?.media || '').replace(/^data:[^;]+;base64,/, '');
      const mimeType = payload?.mimetype || payload?.mimeType || 'application/octet-stream';

      if (!base64) {
        const error = new Error('WhatsApp medya cevabi bos geldi');
        error.code = 'WHATSAPP_CRM_MEDIA_EMPTY';
        error.statusCode = 502;
        throw error;
      }

      return {
        mediaType: payload?.mediaType || '',
        mimeType,
        fileName: payload?.fileName || '',
        fileSize: payload?.size || null,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
