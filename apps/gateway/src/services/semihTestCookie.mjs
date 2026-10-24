// This cookie is a normal password-verified refresh grant, never an anonymous
// TEST bootstrap. It stays host-only and separate from ERP/terminal sessions.
export const SEMIH_TEST_COOKIE='melisa-crm-semih-test-refresh';
export const SEMIH_TEST_REQUEST_PROOF_COOKIE='melisa-crm-semih-test-request-proof-refresh';
const COOKIE_OPTIONS=Object.freeze({httpOnly:true,sameSite:'strict',path:'/api/live/auth'});
const UI_ORIGINS=new Set(['http://127.0.0.1:62700','http://192.168.1.46:62700']);
const PROOF_ORIGIN='http://127.0.0.1:62800';
const proofRequested=()=>process.env.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF==='true';
function allowedOrigins(){
  if(!proofRequested())return UI_ORIGINS;
  return process.env.CRM_UI_ORIGIN===PROOF_ORIGIN&&process.env.CRM_ISOLATED_PREPARATION==='true'
    &&process.env.CRM_TEST_EXPECTED_DATABASE==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    &&process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'?new Set([PROOF_ORIGIN]):new Set();
}
const cookieName=()=>proofRequested()?SEMIH_TEST_REQUEST_PROOF_COOKIE:SEMIH_TEST_COOKIE;
const forbidden=()=>Object.assign(new Error('Bu oturum yalnız aynı TEST ekranından kullanılabilir.'),{code:'AUTH_TEST_ORIGIN_REQUIRED',statusCode:403});

export function semihCookieToken(req){
  const name=cookieName(),matches=String(req.get('cookie')||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(`${name}=`));
  if(!matches.length)return null;
  if(matches.length!==1)throw forbidden();
  const token=matches[0].slice(name.length+1);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Object.assign(new Error('Oturum sona erdi. Yeniden giriş yapın.'),{code:'AUTH_TOKEN_INVALID',statusCode:401});
  return token;
}
export function semihSameOrigin(req,{write=false}={}){
  const origin=req.get('origin'),site=req.get('sec-fetch-site');
  const origins=allowedOrigins();
  if(!origins.size||(origin&&!origins.has(origin))||(site&&!['same-origin','none'].includes(site)))throw forbidden();
  if(write&&(!origins.has(origin)||!req.is('application/json')))throw forbidden();
}
export function semihBrowserLogin(req){
  try{semihSameOrigin(req,{write:true});return true;}catch{return false;}
}
export function writeSemihCookie(res,result){
  res.cookie(cookieName(),result.refreshToken,{...COOKIE_OPTIONS,expires:new Date(result.refreshExpiresAt)});
  const {refreshToken,...publicResult}=result;
  return publicResult;
}
export function clearSemihCookie(res){res.clearCookie(cookieName(),COOKIE_OPTIONS);}
function trustedCookieContext(req){
  try{
    semihSameOrigin(req);
    const origins=allowedOrigins();
    if(origins.has(req.get('origin')))return true;
    return req.get('sec-fetch-site')==='same-origin'&&origins.has(new URL(req.get('referer')).origin);
  }catch{return false;}
}
export function clearRejectedSemihCookie(req,res,error){
  if([401,403].includes(error?.statusCode)&&error.code!=='AUTH_TEST_ORIGIN_REQUIRED'
    &&trustedCookieContext(req)&&String(req.get('cookie')||'').includes(`${cookieName()}=`))clearSemihCookie(res);
}
