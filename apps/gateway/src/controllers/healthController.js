import { getHealth } from '../services/healthService.js';
import { ok } from '../utils/response.js';

export async function getHealthController(req, res, next) {
  try { return ok(res, await getHealth(), {
    source: 'whatsapp-crm-health',
  }); } catch (error) { return next(error); }
}
