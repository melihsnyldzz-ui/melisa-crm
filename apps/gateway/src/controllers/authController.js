import { authenticateCrmUser, publicCrmUser } from '../services/crmAuthService.js';
import { ok } from '../utils/response.js';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';

export function postAuthLogin(req, res, next) {
  try {
    return ok(res, authenticateCrmUser({
      username: req.body?.username,
      password: req.body?.password,
    }), { source: 'crm-auth' });
  } catch (error) {
    return next(error);
  }
}

export function getAuthMe(req, res, next) {
  try {
    return ok(res, publicCrmUser(req.user), { source: 'crm-auth', catalogRead: catalogAccess.canRead(req.user, req.get('authorization') || '') });
  } catch (error) {
    return next(error);
  }
}
