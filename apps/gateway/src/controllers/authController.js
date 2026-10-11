import { refreshWaapiReadiness } from '../services/waapiReadiness.js';
import { authenticateCrmUser, publicCrmUser, refreshNormalCrmSession, logoutNormalCrmSession } from '../services/crmAuthService.js';
import { ok } from '../utils/response.js';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';

export function postAuthLogin(req, res, next) {
  try {
    res.set('Cache-Control','no-store');
    return ok(res, authenticateCrmUser({
      username: req.body?.username,
      password: req.body?.password,
    }), { source: 'crm-auth' });
  } catch (error) {
    return next(error);
  }
}

export function postAuthRefresh(req,res,next){
  try{res.set('Cache-Control','no-store');return ok(res,refreshNormalCrmSession(req.body?.refreshToken),{source:'crm-auth'});}catch(error){return next(error);}
}
export function postAuthLogout(req,res,next){
  try{res.set('Cache-Control','no-store');return ok(res,logoutNormalCrmSession(req.body?.refreshToken),{source:'crm-auth'});}catch(error){return next(error);}
}

export async function getAuthMe(req, res, next) {
  try {
    await refreshWaapiReadiness().catch(() => {});
    return ok(res, publicCrmUser(req.user), { source: 'crm-auth', catalogRead: catalogAccess.canRead(req.user, req.get('authorization') || '') });
  } catch (error) {
    return next(error);
  }
}
