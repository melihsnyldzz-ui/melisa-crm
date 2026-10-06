import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Process-local browser rehearsal only. No normal login, user, password or role is changed.
let installed = null;
const origins = {ui:'http://127.0.0.1:62400',gateway:'http://127.0.0.1:62401'};
const fingerprint = user => JSON.stringify([user.id,user.username,user.role,user.chatwootAgentId,[...user.permissions].sort()]);
function current(state) {
  const user=state.resolveUser(state.username);
  if(!user||!user.active||user.role!=='personel'||user.username!==state.username
    ||!Number.isSafeInteger(user.chatwootAgentId)||user.chatwootAgentId<1
    ||!Array.isArray(user.permissions)||!user.permissions.includes('crm.view')
    ||fingerprint(user)!==state.fingerprint)throw Error('TEST_PERSONNEL_IDENTITY_REQUIRED');
  return {...user,permissions:['crm.view','crm.send'],testPersonnel:true,testPersonnelScope:'assigned-conversations; outbound-only-905387217733'};
}
export function installTestPersonnelSession({uiOrigin,gatewayOrigin,username,resolveUser}) {
  if(uiOrigin!==origins.ui||gatewayOrigin!==origins.gateway||username!=='crm-ahmet'||typeof resolveUser!=='function')throw Error('TEST_PERSONNEL_ORIGIN_REQUIRED');
  const user=resolveUser(username);
  if(!user||!Array.isArray(user.permissions))throw Error('TEST_PERSONNEL_IDENTITY_REQUIRED');
  const state={username,resolveUser,fingerprint:fingerprint(user),secret:crypto.randomBytes(48).toString('hex'),options:{issuer:'melisa-crm-loopback-personnel-rehearsal',audience:origins.gateway}};
  current(state);installed=state;
  return () => {
    const actor=current(state);
    return {accessToken:jwt.sign({testPersonnel:true,identity:state.fingerprint},state.secret,{...state.options,algorithm:'HS256',subject:actor.id,expiresIn:900,jwtid:crypto.randomUUID()}),tokenType:'Bearer',expiresIn:900};
  };
}
export function verifyTestPersonnelSession(token,{includeContext=false}={}) {
  if(!installed)return null;
  try {
    const payload=jwt.verify(token,installed.secret,{...installed.options,algorithms:['HS256']});
    const user=current(installed);
    if(payload.sub!==user.id||payload.testPersonnel!==true||payload.identity!==installed.fingerprint||typeof payload.jti!=='string')return null;
    return includeContext?{user,expiresAt:payload.exp*1000}:user;
  } catch {return null;}
}
