import { getWhatsAppProvider } from '../providers/index.js';
import { getMessageMediaSource } from '../repositories/crmRepository.js';

function mediaError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function getCrmMessageMedia(messageId) {
  if (/^\d+$/.test(String(messageId || '').trim())) {
    throw mediaError(
      'WHATSAPP_CRM_EXTERNAL_MEDIA_DIRECT',
      'Harici Chatwoot medyasi dogrudan mesaj adresinden okunmalidir.',
      404,
    );
  }

  const source = await getMessageMediaSource(messageId);

  if (!source) {
    throw mediaError('WHATSAPP_CRM_MESSAGE_NOT_FOUND', 'Mesaj bulunamadi.', 404);
  }

  if (!['image', 'video', 'audio', 'file', 'sticker'].includes(source.message_type)) {
    throw mediaError('WHATSAPP_CRM_MESSAGE_HAS_NO_MEDIA', 'Bu mesajda medya dosyasi yok.', 400);
  }

  const provider = getWhatsAppProvider();
  const media = await provider.getMessageMedia({
    rawPayload: source.raw_payload || {},
    instanceKey: source.instance_key,
  });

  return {
    messageId: source.id,
    messageType: source.message_type,
    ...media,
  };
}
