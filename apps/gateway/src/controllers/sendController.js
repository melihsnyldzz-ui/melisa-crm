import { sendCrmTextMessage } from '../services/sendService.js';
import { created } from '../utils/response.js';

export async function postCrmSendMessage(req, res, next) {
  try {
    const result = await sendCrmTextMessage(req.body || {});

    return created(res, result, {
      source: 'whatsapp-crm-send',
      externalSideEffect: 'whatsapp-message-sent',
      readOnlyErp: true,
    });
  } catch (error) {
    return next(error);
  }
}
