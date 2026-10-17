import { env } from '../config/env.js';
import { getWhatsAppProvider } from '../providers/index.js';
import { persistOutboundMessage } from '../repositories/crmRepository.js';
import { verifyChatwootOutboundProof } from './chatwootDeliveryProofService.js';
import { waapiChatwootBridge } from './waapiChatwootBridge.js';
import { waapiJournal } from './waapiJournal.js';
import { WAAPI_INSTANCE, WAAPI_RECIPIENT } from '../providers/waapiProvider.js';
import { normalizeOutboundMedia, mediaForJournal } from '../utils/messageMedia.js';
import {
  fingerprintOutbound,
  outboundAttemptStore,
  publicOutboundAttempt,
  validateClientRequestId,
} from './outboundAttemptService.js';

function sendError(code, message, statusCode = 400, meta = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (meta) error.meta = meta;
  return error;
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeConversationId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  return trimText(value);
}

function messageFromProviderResult(providerResult) {
  const sentAt = providerResult.sentAt || new Date().toISOString();

  return {
    id: providerResult.providerMessageId || `provider-${Date.now()}`,
    direction: 'outgoing',
    type: providerResult.messageType || 'text',
    text: providerResult.text || '',
    imageUrl: '',
    mimeType: providerResult.media?.mimeType || '',
    fileName: providerResult.media?.fileName || '',
    time: new Date(sentAt).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul',
    }),
    status: providerResult.provider === 'waapi' ? 'accepted' : 'sent',
    received_at: sentAt,
  };
}

function normalizePhone(value = '') {
  const digits = trimText(value).replace(/[^\d]/g, '');

  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
  return digits;
}

function getUnsupportedTargetReason({ phone, remoteJid }) {
  const jid = trimText(remoteJid).toLowerCase();

  if (jid.endsWith('@g.us')) {
    return 'Bu sohbet grup kimligiyle geldi; grup gonderimi icin ayri destek gerekiyor.';
  }

  if (!jid.endsWith('@lid') && phone.length > 15) {
    return 'WhatsApp hedefi gercek telefon numarasi gibi gorunmuyor.';
  }

  return '';
}

function assertSendConfiguration(phone, conversationId) {
  if (!env.whatsapp.sendEnabled) {
    throw sendError(
      'WHATSAPP_CRM_SEND_DISABLED',
      'WhatsApp CRM gonderimi kapali. Acmak icin WHATSAPP_SEND_ENABLED=true gerekir.',
      403,
    );
  }

  if (env.whatsapp.provider === 'waapi' && (!env.whatsapp.liveSendApproved || env.whatsapp.autoReply.enabled)) {
    throw sendError('WHATSAPP_CRM_WAAPI_SEND_NOT_APPROVED', 'WAAPI gonderim kapisi kapali.', 403);
  }
  if (env.whatsapp.provider === 'waapi' && phone !== WAAPI_RECIPIENT) {
    throw sendError('WHATSAPP_CRM_WAAPI_RECIPIENT_NOT_ALLOWED', 'WAAPI denemesinde bu aliciya izin verilmedi.', 403);
  }
  if (!env.whatsapp.testNumberOnly && !env.whatsapp.liveSendApproved) {
    throw sendError(
      'WHATSAPP_CRM_LIVE_SEND_NOT_APPROVED',
      'Canli WhatsApp gonderimi icin acik insan onayi gerekir.',
      403,
    );
  }

  if (env.whatsapp.provider === 'evolution'
    && (!env.evolution.apiUrl || !env.evolution.apiKey || !env.evolution.instance)) {
    throw sendError('WHATSAPP_CRM_EVOLUTION_NOT_CONFIGURED', 'Evolution API ayarlari eksik', 503);
  }

  if (env.whatsapp.provider === 'chatwoot') {
    if (!env.chatwoot.baseUrl || !env.chatwoot.accountId || !env.chatwoot.apiAccessToken) {
      throw sendError('WHATSAPP_CRM_CHATWOOT_NOT_CONFIGURED', 'Chatwoot API ayarlari eksik', 503);
    }

    if (!/^\d+$/.test(conversationId)) {
      throw sendError(
        'WHATSAPP_CRM_CHATWOOT_CONVERSATION_REQUIRED',
        'Chatwoot gonderimi icin gecerli konusma kimligi zorunludur.',
        400,
      );
    }
  }

  if (env.whatsapp.testNumberOnly) {
    const allowedNumbers = env.whatsapp.allowedTestNumbers.map(normalizePhone).filter(Boolean);

    if (allowedNumbers.length < 1) {
      throw sendError(
        'WHATSAPP_CRM_SEND_ALLOWLIST_EMPTY',
        'Test modu acik ama WHATSAPP_ALLOWED_TEST_NUMBERS bos; gonderim fail-closed.',
        403,
      );
    }

    if (!allowedNumbers.includes(phone)) {
      throw sendError(
        'WHATSAPP_CRM_SEND_NUMBER_NOT_ALLOWED',
        'Bu telefon numarasi test gonderim listesinde degil.',
        403,
      );
    }
  }
}

export function getSendStatus() {
  return {
    provider: env.whatsapp.provider,
    sendEnabled: env.whatsapp.sendEnabled && (env.whatsapp.testNumberOnly || env.whatsapp.liveSendApproved),
    testNumberOnly: env.whatsapp.testNumberOnly,
    liveSendApproved: env.whatsapp.liveSendApproved,
    allowedTestNumberCount: env.whatsapp.allowedTestNumbers.length,
    evolutionConfigured: Boolean(env.evolution.apiUrl && env.evolution.apiKey && env.evolution.instance),
    chatwootConfigured: Boolean(env.chatwoot.baseUrl && env.chatwoot.accountId && env.chatwoot.apiAccessToken),
  };
}

function duplicateAttemptError(attempt) {
  const code = attempt.state === 'UNCONFIRMED_NO_RETRY'
    ? 'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY'
    : 'WHATSAPP_CRM_DUPLICATE_REQUEST';
  const message = attempt.state === 'UNCONFIRMED_NO_RETRY'
    ? 'Onceki gonderimin teslimi dogrulanamadi; ayni istek tekrar gonderilmedi.'
    : 'Bu clientRequestId daha once islendi; saglayiciya tekrar gonderilmedi.';
  return sendError(code, message, 409, {
    deliveryState: attempt.state,
    clientRequestId: attempt.clientRequestId,
  });
}

export async function sendCrmTextMessage(payload = {}, dependencies = {}) {
  const phone = normalizePhone(payload.phone);
  const remoteJid = trimText(payload.remoteJid);
  const contactName = trimText(payload.contactName);
  const text = trimText(payload.text);
  const media = normalizeOutboundMedia(payload.media);
  const conversationId = normalizeConversationId(payload.conversationId);
  const instanceKey = trimText(payload.instanceKey);

  if (env.whatsapp.provider !== 'chatwoot' && phone.length < 10) {
    throw sendError('WHATSAPP_CRM_PHONE_INVALID', 'WhatsApp telefon numarasi gecersiz');
  }

  const unsupportedReason = getUnsupportedTargetReason({ phone, remoteJid });
  if (unsupportedReason) {
    throw sendError('WHATSAPP_CRM_SEND_TARGET_UNSUPPORTED', unsupportedReason);
  }

  if (!text && !media) {
    throw sendError('WHATSAPP_CRM_MESSAGE_REQUIRED', 'Gonderilecek mesaj bos olamaz');
  }

  if (text.length > 4000) {
    throw sendError('WHATSAPP_CRM_MESSAGE_TOO_LONG', 'WhatsApp mesaji 4000 karakterden uzun olamaz');
  }

  assertSendConfiguration(phone, conversationId);
  if (env.whatsapp.provider === 'waapi' && media && !env.waapi.outboundMediaEnabled) {
    throw sendError('WHATSAPP_CRM_WAAPI_PILOT_TEXT_ONLY', 'WAAPI medya gonderimi icin ayri onay kapisi kapali.', 400, { transportAttempted: false });
  }
  const clientRequestId = validateClientRequestId(payload.clientRequestId);

  const fingerprint = fingerprintOutbound({
    actorId: String(payload.actorId || ''),
    conversationId,
    provider: env.whatsapp.provider,
    phone,
    remoteJid,
    text,
    media,
  });
  const attemptStore = dependencies.attemptStore || outboundAttemptStore;
  const started = await attemptStore.begin({
    clientRequestId,
    fingerprint,
    conversationId,
    provider: env.whatsapp.provider,
  });
  if (!started.created) {
    if (started.attempt.state === 'CONFIRMED') {
      return publicOutboundAttempt(started.attempt, { duplicate: true });
    }
    throw duplicateAttemptError(started.attempt);
  }

  const provider = dependencies.provider || getWhatsAppProvider();
  let providerResult;
  try {
    if (env.whatsapp.provider === 'waapi') {
      const bridge = dependencies.bridge || waapiChatwootBridge;
      await bridge.assertSafe();
      await bridge.resolveConversation(phone, conversationId);
    }
    if (typeof dependencies.beforeProviderSend === 'function') {
      try { await dependencies.beforeProviderSend(); }
      catch (error) {
        // Authorization rejection happened before any message transport. Keep
        // the UUID journal truthful instead of recording an uncertain send.
        error.meta = {...error.meta, transportAttempted:false};
        throw error;
      }
    }
    providerResult = await provider.sendMessage({
      phone,
      remoteJid,
      contactName,
      text,
      media,
      conversationId,
      instanceKey,
    });
  } catch (error) {
    if (error.meta?.transportAttempted === false) {
      await attemptStore.update(clientRequestId, { state: 'REJECTED_BEFORE_TRANSPORT' });
      throw error;
    }
    const attempt = await attemptStore.update(clientRequestId, { state: 'UNCONFIRMED_NO_RETRY' });
    throw sendError(
      'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY',
      'Saglayici gonderim sonucu dogrulanamadi; guvenlik geregi tekrar denenmeyecek.',
      502,
      {
        deliveryState: attempt.state,
        clientRequestId,
        providerStatus: error.meta?.status || null,
        providerCode: error.meta?.providerCode || error.code || null,
      },
    );
  }

  const providerMessageId = String(providerResult.providerMessageId || '').trim();
  if (!providerMessageId) {
    const attempt = await attemptStore.update(clientRequestId, { state: 'UNCONFIRMED_NO_RETRY' });
    throw sendError(
      'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY',
      'Saglayici mesaj kimligi vermedi; gonderim basarili sayilmadi ve tekrar denenmeyecek.',
      502,
      { deliveryState: attempt.state, clientRequestId },
    );
  }

  let proof;
  try {
    if (env.whatsapp.provider === 'waapi') {
      await attemptStore.update(clientRequestId, { state: 'PROVIDER_ACCEPTED', providerMessageId });
      const event = { instanceId: WAAPI_INSTANCE, event: 'message_create', providerMessageId,
        phone, text, direction: 'outgoing', media: mediaForJournal(media), mediaPending: false, conversationId,
        timestamp: Math.floor(Date.parse(providerResult.sentAt || '') / 1000) || null };
      await (dependencies.journal || waapiJournal).accept(event);
      await (dependencies.bridge || waapiChatwootBridge).sync(event, conversationId);
    }
    const verifyDeliveryProof = dependencies.verifyDeliveryProof || verifyChatwootOutboundProof;
    proof = await verifyDeliveryProof({ conversationId, providerMessageId });
  } catch {
    proof = { confirmed: false, reason: 'chatwoot-proof-unavailable' };
  }

  if (!proof?.confirmed || !proof.chatwootMessageId) {
    const attempt = await attemptStore.update(clientRequestId, {
      state: 'UNCONFIRMED_NO_RETRY',
      providerMessageId,
    });
    throw sendError(
      'WHATSAPP_CRM_UNCONFIRMED_NO_RETRY',
      'Saglayici kimligi alindi ancak Chatwoot teslim kaniti bulunamadi; tekrar denenmeyecek.',
      502,
      { deliveryState: attempt.state, clientRequestId, providerMessageIdPresent: true },
    );
  }

  const confirmedAttempt = await attemptStore.update(clientRequestId, {
    state: 'CONFIRMED',
    providerMessageId,
    chatwootMessageId: String(proof.chatwootMessageId),
  });
  const usesExternalConversationId = /^\d+$/.test(conversationId);
  const persistedMessage = usesExternalConversationId
    ? messageFromProviderResult(providerResult)
    : await persistOutboundMessage({ conversationId, providerResult });

  return {
    phone,
    conversationId: conversationId || null,
    message: persistedMessage,
    providerMessageId: providerResult.providerMessageId,
    sentAt: providerResult.sentAt,
    sendStatus: getSendStatus(),
    delivery: publicOutboundAttempt(confirmedAttempt),
  };
}

// A read-only journal lookup. The same actor, target and complete normalized
// body must match the original attempt; this path never begins or updates one.
export async function readCrmOutboundStatus(payload = {}, dependencies = {}) {
  const clientRequestId = validateClientRequestId(payload.clientRequestId);
  const conversationId = normalizeConversationId(payload.conversationId);
  const fingerprint = fingerprintOutbound({
    actorId: String(payload.actorId || ''), conversationId, provider: env.whatsapp.provider,
    phone: normalizePhone(payload.phone), remoteJid: trimText(payload.remoteJid),
    text: trimText(payload.text), media: normalizeOutboundMedia(payload.media),
  });
  const attempt = await (dependencies.attemptStore || outboundAttemptStore).get(clientRequestId);
  if (!attempt) throw sendError('WHATSAPP_CRM_ATTEMPT_NOT_FOUND', 'Gönderim kaydı bulunamadı; kilit korunuyor.', 404);
  if (attempt.fingerprint !== fingerprint || attempt.conversationId !== conversationId || attempt.provider !== env.whatsapp.provider)
    throw sendError('WHATSAPP_CRM_IDEMPOTENCY_CONFLICT', 'Gönderim kaydı bu hesap ve mesajla eşleşmedi; kilit korunuyor.', 409);
  return publicOutboundAttempt(attempt);
}
