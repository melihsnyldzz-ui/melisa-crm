import { getCrmMessageMedia } from '../services/mediaService.js';
import { ok } from '../utils/response.js';

export async function getCrmMessageMediaController(req, res, next) {
  try {
    const result = await getCrmMessageMedia(req.params.messageId);

    return ok(res, result, {
      source: 'whatsapp-crm-message-media',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
