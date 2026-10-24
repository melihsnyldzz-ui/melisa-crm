import { getWhatsAppProvider } from '../providers/index.js';
import { getMessageMediaSource } from '../repositories/crmRepository.js';

function mediaError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export async function getCrmMessageMedia(messageId, {getCurrentUser, readSource=getMessageMediaSource, getProvider=getWhatsAppProvider} = {}) {
  if (/^\d+$/.test(String(messageId || '').trim())) {
    throw mediaError(
      'WHATSAPP_CRM_EXTERNAL_MEDIA_DIRECT',
      'Harici Chatwoot medyasi dogrudan mesaj adresinden okunmalidir.',
      404,
    );
  }

  const source = await readSource(messageId);

  if (!source) {
    throw mediaError('WHATSAPP_CRM_MESSAGE_NOT_FOUND', 'Mesaj bulunamadi.', 404);
  }

  if (!['image', 'video', 'audio', 'file', 'sticker'].includes(source.message_type)) {
    throw mediaError('WHATSAPP_CRM_MESSAGE_HAS_NO_MEDIA', 'Bu mesajda medya dosyasi yok.', 400);
  }

  const assertAccess = value => {
    const user = getCurrentUser?.();
    if (!user?.active || !user.permissions?.includes('crm.view')) throw mediaError('WHATSAPP_CRM_PERMISSION_DENIED','Medya erişimi için güncel oturum gerekli.',403);
    if (user.role === 'personel' && (!value?.assigned_user_id || String(value.assigned_user_id) !== String(user.id)))
      throw mediaError('WHATSAPP_CRM_CONVERSATION_FORBIDDEN','Bu konuşma bu personele atanmamış.',403);
  };
  assertAccess(source);
  const provider = getProvider();
  const media = await provider.getMessageMedia({
    rawPayload: source.raw_payload || {},
    instanceKey: source.instance_key,
  });

  const currentSource = await readSource(messageId);
  if (!currentSource || String(currentSource.conversation_id) !== String(source.conversation_id)) throw mediaError('WHATSAPP_CRM_CONVERSATION_FORBIDDEN','Medya konuşması değişti.',403);
  assertAccess(currentSource);
  return {
    messageId: source.id,
    messageType: source.message_type,
    ...media,
  };
}
