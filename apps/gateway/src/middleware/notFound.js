import { fail } from '../utils/response.js';

export function notFoundHandler(req, res) {
  return fail(res, 404, 'WHATSAPP_CRM_ROUTE_NOT_FOUND', 'WhatsApp CRM route not found', {
    requestId: req.requestId,
  });
}
