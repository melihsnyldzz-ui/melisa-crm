import { getInboxOverview } from '../services/inboxService.js';
import { ok } from '../utils/response.js';
import { createTestPersonnelRequestGuard } from './conversationController.js';

export async function getInboxController(req, res, next) {
  try {
    const guard = createTestPersonnelRequestGuard(req);
    if (req.query?.view !== undefined && req.query.view !== 'bootstrap') {
      throw Object.assign(new Error('Gelen kutusu gorunumu gecersiz.'), {
        code: 'WHATSAPP_CRM_INBOX_VIEW_INVALID', statusCode: 400,
      });
    }
    const limit = req.query?.limit;
    const offset = req.query?.offset;
    const overview = await getInboxOverview({ limit, offset, view: req.query?.view, user: req.user });
    if (guard) {
      await guard();
      if (req.query?.view === 'bootstrap' && overview.summary?.source === 'chatwoot-crm') {
        await guard({conversationIds:(overview.conversations || []).map(item=>item.id)});
      } else {
        await Promise.all((overview.conversations || []).map(item => guard({conversationId:item.id})));
      }
      await guard();
    }

    return ok(res, overview, {
      source: overview.summary?.source || 'whatsapp-crm-inbox',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
