import { refreshWaapiReadiness } from '../services/waapiReadiness.js';
import { authenticateCrmUser, authenticateCrmTerminalHandoff, publicCrmUser, refreshNormalCrmSessionVerified, logoutNormalCrmSessionVerified, logoutNormalAccessSessionVerified, refreshSemihCrmSession, logoutSemihCrmSession, rememberedSemihCrmUser, semihTestContinueEnabled } from '../services/crmAuthService.js';
import { semihCookieToken, semihSameOrigin, semihBrowserLogin, writeSemihCookie, clearSemihCookie, clearRejectedSemihCookie } from '../services/semihTestCookie.mjs';
import { ok } from '../utils/response.js';
import { catalogAccess } from '../services/crmCatalogAccess.mjs';

export function postAuthLogin(req, res, next) {
  try {
    res.set('Cache-Control','no-store');
    if(process.env.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF==='true'&&req.body?.transport!=='native')semihSameOrigin(req,{write:true});
    const result=authenticateCrmUser({
      username: req.body?.username,
      password: req.body?.password,
    });
    if(semihTestContinueEnabled()&&req.body?.transport!=='native'&&semihBrowserLogin(req)){
      const previous=semihCookieToken(req);
      if(previous)logoutSemihCrmSession(previous);
      if(result.user.normalTestScope?.semihTestContinue&&result.refreshToken)return ok(res,writeSemihCookie(res,result),{source:'crm-auth'});
      clearSemihCookie(res);
    }
    return ok(res,result,{source:'crm-auth'});
  } catch (error) {
    clearRejectedSemihCookie(req,res,error);
    return next(error);
  }
}

function cookieRefreshToken(req){
  if(!semihTestContinueEnabled())return null;
  semihSameOrigin(req,{write:true});
  if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length)throw Object.assign(new Error('Oturum isteği geçerli değil.'),{code:'AUTH_TOKEN_INVALID',statusCode:401});
  return semihCookieToken(req);
}
export async function postAuthRefresh(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    const nativeMode=typeof req.body?.refreshToken==='string';
    const result=nativeMode?await refreshNormalCrmSessionVerified(req.body.refreshToken):refreshSemihCrmSession(cookieRefreshToken(req));
    return ok(res,nativeMode?result:writeSemihCookie(res,result),{source:'crm-auth'});
  }catch(error){clearRejectedSemihCookie(req,res,error);return next(error);}
}
export async function postAuthLogout(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    const authorization=req.get('authorization')||'';
    if(authorization){
      // A reloaded browser has its existing access JWT but no RAM-only refresh
      // secret. Never combine this exact own-family operation with another grant.
      if(!/^Bearer [^\s]+$/.test(authorization)||!req.is('application/json')||!req.body||Array.isArray(req.body)
        ||Object.keys(req.body).length||Object.keys(req.query||{}).length
        ||/melisa-crm-semih-test(?:-request-proof)?-refresh=/.test(req.get('cookie')||''))throw Object.assign(new Error('Oturum isteği geçerli değil.'),{code:'AUTH_TOKEN_INVALID',statusCode:401});
      return ok(res,await logoutNormalAccessSessionVerified(authorization.slice(7)),{source:'crm-auth'});
    }
    const nativeMode=typeof req.body?.refreshToken==='string';
    const token=nativeMode?req.body.refreshToken:cookieRefreshToken(req);
    const result=nativeMode?await logoutNormalCrmSessionVerified(token):semihTestContinueEnabled()&&!token?{loggedOut:true}:logoutSemihCrmSession(token);
    if(!nativeMode)clearSemihCookie(res);
    return ok(res,result,{source:'crm-auth'});
  }catch(error){clearRejectedSemihCookie(req,res,error);return next(error);}
}
export async function postAuthTerminalHandoff(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    if(!req.is('application/json')||Object.keys(req.query||{}).length||req.get('authorization')||req.get('cookie')
      ||req.get('origin')&&req.get('origin')!==req.body?.crmOrigin)throw Object.assign(Error('Terminal giriş isteği geçerli değil.'),{statusCode:403,code:'CRM_TERMINAL_IDENTITY_REQUIRED'});
    return ok(res,await authenticateCrmTerminalHandoff(req.body),{source:'crm-auth'});
  }catch(error){return next(error);}
}
export function getAuthRemembered(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    if(!semihTestContinueEnabled())return ok(res,{enabled:false,user:null},{source:'crm-auth'});
    semihSameOrigin(req);
    const user=rememberedSemihCrmUser(semihCookieToken(req));
    return ok(res,{enabled:true,user},{source:'crm-auth'});
  }catch(error){
    clearRejectedSemihCookie(req,res,error);
    if(error.statusCode===401)return ok(res,{enabled:true,user:null},{source:'crm-auth'});
    return next(error);
  }
}

export async function getAuthMe(req, res, next) {
  try {
    await refreshWaapiReadiness().catch(() => {});
    return ok(res, publicCrmUser(req.user), { source: 'crm-auth', catalogRead: catalogAccess.canRead(req.user, req.get('authorization') || '') });
  } catch (error) {
    return next(error);
  }
}
