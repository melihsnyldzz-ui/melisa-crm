import { getInboxOverview } from '../services/inboxService.js';
import { ok } from '../utils/response.js';

export async function getInboxController(req, res, next) {
  try {
    const limit = req.query?.limit;
    const offset = req.query?.offset;
    const overview = await getInboxOverview({ limit, offset, user: req.user });

    return ok(res, overview, {
      source: overview.summary?.source || 'whatsapp-crm-inbox',
      readOnly: true,
    });
  } catch (error) {
    return next(error);
  }
}
