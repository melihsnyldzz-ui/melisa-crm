import { getCrmMessageMedia } from '../services/mediaService.js';
import { verifyCrmAccessToken } from '../services/crmAuthService.js';
import { ok } from '../utils/response.js';

export async function getCrmMessageMediaController(req, res, next) {
  try {
    const result = await getCrmMessageMedia(req.params.messageId, {getCurrentUser:() => verifyCrmAccessToken((req.get('authorization') || '').slice(7))});

    return ok(res, result, {
      source: 'whatsapp-crm-message-media',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
