import { updateConversationContactPhone } from '../repositories/crmRepository.js';
import { ok } from '../utils/response.js';

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/[^\d]/g, '');

  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`;
  return digits;
}

export async function putConversationContactPhone(req, res, next) {
  try {
    const conversationId = String(req.params.conversationId || '').trim();
    const phone = normalizePhone(req.body?.phone);

    if (!conversationId) {
      const error = new Error('Conversation id gereklidir.');
      error.code = 'WHATSAPP_CRM_CONVERSATION_ID_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    if (phone.length < 10 || phone.length > 15) {
      const error = new Error('WhatsApp telefon numarasi gecersiz.');
      error.code = 'WHATSAPP_CRM_PHONE_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const contact = await updateConversationContactPhone({ conversationId, phone });
    if (!contact) {
      const error = new Error('CRM sohbeti bulunamadi.');
      error.code = 'WHATSAPP_CRM_CONVERSATION_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    return ok(res, { conversationId, contact }, {
      source: 'whatsapp-crm-contact-phone',
    });
  } catch (error) {
    return next(error);
  }
}
