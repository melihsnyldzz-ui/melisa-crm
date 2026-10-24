import { getInboxOverview } from '../services/inboxService.js';
import { ok } from '../utils/response.js';
import { createTestPersonnelRequestGuard, createConversationHistoryRequestGuard } from './conversationController.js';

export async function getInboxController(req, res, next) {
  try {
    const guard = createTestPersonnelRequestGuard(req);
    // Reuse the normal verifier/fingerprint contract: data fetched while the
    // actor was deactivated, reassigned or revoked must not leave this request.
    const normalGuard = req.user?.role === 'personel' && !req.user.testPersonnel
      ? createConversationHistoryRequestGuard(req) : null;
    if (req.query?.view !== undefined && req.query.view !== 'bootstrap') {
      throw Object.assign(new Error('Gelen kutusu gorunumu gecersiz.'), {
        code: 'WHATSAPP_CRM_INBOX_VIEW_INVALID', statusCode: 400,
      });
    }
    await normalGuard?.();
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

    await normalGuard?.();
    return ok(res, overview, {
      source: overview.summary?.source || 'whatsapp-crm-inbox',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
