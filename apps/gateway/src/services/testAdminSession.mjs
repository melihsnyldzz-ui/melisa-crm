import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Installed exclusively by the loopback TEST launcher, never from dotenv.
// Real users and the LIVE signing secret remain independent.
let testSession = null;
export function installTestAdminSession({uiOrigin, gatewayOrigin}) {
  if (![['http://127.0.0.1:62400','http://127.0.0.1:62401'],['http://127.0.0.1:62600','http://127.0.0.1:62601'],['http://127.0.0.1:62700','http://127.0.0.1:62701']].some(([ui,gateway])=>uiOrigin===ui&&gatewayOrigin===gateway)) throw Error('TEST_ADMIN_ORIGIN_REQUIRED');
  const secret = crypto.randomBytes(48).toString('hex');
  const user = Object.freeze({id:'crm-test-admin', username:'test-admin', displayName:'TEST ADMIN', role:'patron',
    active:true, testAdmin:true, chatwootAgentId:null,
    permissions:Object.freeze(['crm.view','crm.send','crm.assign','crm.agents','crm.manage'])});
  const options = {issuer:'melisa-crm-loopback-test', audience:gatewayOrigin};
  testSession = {secret,user,options};
  return () => ({accessToken:jwt.sign({testAdmin:true},secret,{...options,subject:user.id,expiresIn:'8h',jwtid:crypto.randomUUID()}),
    tokenType:'Bearer',expiresIn:'8h'});
}
export function verifyTestAdminSession(token, {includeContext=false}={}) {
  if (!testSession) return null;
  try {
    const payload = jwt.verify(token,testSession.secret,{...testSession.options,algorithms:['HS256']});
    if(payload.sub!==testSession.user.id || payload.testAdmin!==true)return null;
    return includeContext ? {user:testSession.user,expiresAt:payload.exp*1000} : testSession.user;
  } catch { return null; }
}
