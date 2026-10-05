import { getInboxOverview } from '../services/inboxService.js';
import { ok } from '../utils/response.js';

export async function getInboxController(req, res, next) {
  try {
    if (req.query?.view !== undefined && req.query.view !== 'bootstrap') {
      throw Object.assign(new Error('Gelen kutusu gorunumu gecersiz.'), {
        code: 'WHATSAPP_CRM_INBOX_VIEW_INVALID', statusCode: 400,
      });
    }
    const limit = req.query?.limit;
    const offset = req.query?.offset;
    const overview = await getInboxOverview({ limit, offset, view: req.query?.view, user: req.user });

    return ok(res, overview, {
      source: overview.summary?.source || 'whatsapp-crm-inbox',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
