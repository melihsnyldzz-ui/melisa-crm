import { refreshWaapiReadiness } from '../services/waapiReadiness.js';
import { authenticateCrmUser, publicCrmUser, refreshNormalCrmSession, logoutNormalCrmSession, refreshSemihCrmSession, logoutSemihCrmSession, rememberedSemihCrmUser, semihTestContinueEnabled } from '../services/crmAuthService.js';
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
export function postAuthRefresh(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    const nativeMode=typeof req.body?.refreshToken==='string';
    const result=nativeMode?refreshNormalCrmSession(req.body.refreshToken):refreshSemihCrmSession(cookieRefreshToken(req));
    return ok(res,nativeMode?result:writeSemihCookie(res,result),{source:'crm-auth'});
  }catch(error){clearRejectedSemihCookie(req,res,error);return next(error);}
}
export function postAuthLogout(req,res,next){
  try{
    res.set('Cache-Control','no-store');
    const nativeMode=typeof req.body?.refreshToken==='string';
    const token=nativeMode?req.body.refreshToken:cookieRefreshToken(req);
    const result=nativeMode?logoutNormalCrmSession(token):semihTestContinueEnabled()&&!token?{loggedOut:true}:logoutSemihCrmSession(token);
    if(!nativeMode)clearSemihCookie(res);
    return ok(res,result,{source:'crm-auth'});
  }catch(error){clearRejectedSemihCookie(req,res,error);return next(error);}
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
