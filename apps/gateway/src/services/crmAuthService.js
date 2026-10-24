import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { waapiSendReady } from './waapiReadiness.js';
import { verifyTestAdminSession } from './testAdminSession.mjs';
import { verifyTestPersonnelSession } from './testPersonnelSession.mjs';
import { configuredNormalRefreshStore, configuredSemihTestRefreshStore, isDedicatedNormalTestUser, isDedicatedSemihTestUser, normalRefreshUserPolicy, semihRefreshUserPolicy, normalSessionFingerprint, DEDICATED_NORMAL_TEST_USER_ID, DEDICATED_SEMIH_TEST_USER_ID, CLEAN_NORMAL_TEST_USER_ID } from './normalRefreshSession.mjs';
import {configuredCustomerRequestIssuerStore,customerRequestSharedConfig} from './customerRequestIssuerSession.mjs';
import {configuredAssignedStaffRefreshStore,DEDICATED_ASSIGNED_STAFF_TEST_USER_ID} from './assignedStaffRefreshSession.mjs';
import {configuredTerminalHandoffPeer,isTerminalPeerProof} from './terminalHandoffPeer.mjs';
import {reject as terminalReject,validateTerminalRequest,terminalIdentityKey} from '../../../../packages/contracts/terminal-handoff.mjs';
import {configuredCleanCrmManagement} from './cleanCrmManagement.mjs';

const ROLE_PERMISSIONS = Object.freeze({
  patron: ['crm.view', 'crm.send', 'crm.assign', 'crm.agents', 'crm.manage'],
  mudur: ['crm.view', 'crm.send', 'crm.assign', 'crm.agents', 'crm.manage'],
  personel: ['crm.view'],
});

const DUMMY_SALT = 'melisa-crm-invalid-user';
const DUMMY_DIGEST = crypto.scryptSync('invalid-password', DUMMY_SALT, 64).toString('hex');
// Account eligibility alone does not grant issuer authority to legacy JWTs.
// Only a user object returned after verifying its issuer session carries it.
const verifiedCustomerRequestIssuers = new WeakSet();
const verifiedAssignedStaffSessions = new WeakSet();
const verifiedCleanNormalSessions = new WeakSet();
const linkedTerminalGrants = new WeakMap();
const verifiedTerminalIdentities = new WeakMap();

function authError(code, message, statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR');
}

function parsePasswordHash(value = '') {
  const [algorithm, salt, digest] = String(value).split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(digest || '')) return null;
  return { salt, digest };
}

function verifyPassword(password, passwordHash) {
  const parsed = parsePasswordHash(passwordHash) || { salt: DUMMY_SALT, digest: DUMMY_DIGEST };
  const expected = Buffer.from(parsed.digest, 'hex');
  const actual = crypto.scryptSync(String(password || ''), parsed.salt, expected.length);
  return Boolean(parsePasswordHash(passwordHash))
    && expected.length === actual.length
    && crypto.timingSafeEqual(expected, actual);
}

function rolePermissions(role) {
  const base = ROLE_PERMISSIONS[role] || [];
  if (role === 'personel' && env.auth.personnelCanSend) {
    return [...base, 'crm.send'];
  }
  return [...base];
}

function normalizeUser(entry = {},{managed=false}={}) {
  const role = String(entry.role || '').trim().toLocaleLowerCase('tr-TR');
  const id = String(entry.id || '').trim();
  const username = normalizeUsername(entry.username);
  if (!id || !username || !ROLE_PERMISSIONS[role] || !parsePasswordHash(entry.passwordHash)||entry.testAdmin===true||entry.testPersonnel===true) return null;

  const chatwootAgentId = Number(entry.chatwootAgentId);
  return {
    id,
    username,
    displayName: String(entry.displayName || username).trim(),
    role,
    active: entry.active !== false,
    chatwootAgentId: Number.isInteger(chatwootAgentId) && chatwootAgentId > 0 ? chatwootAgentId : null,
    permissions: rolePermissions(role),
    passwordHash: entry.passwordHash,
    ...(managed?{managementRevision:entry.managementRevision}:{}),
  };
}

export function listConfiguredCrmUsers() {
  return [...env.auth.users.map(entry=>normalizeUser(entry)).filter(Boolean),...(cleanCrmManagement?.records()||[]).map(entry=>normalizeUser(entry,{managed:true})).filter(Boolean)];
}

export const cleanCrmManagement=configuredCleanCrmManagement({baseline:()=>env.auth.users.map(entry=>normalizeUser(entry))});
export const cleanCrmManagementEnabled=()=>Boolean(cleanCrmManagement?.overview().enabled);
const managedUserAllowed=user=>Boolean(cleanCrmManagement?.isManaged(user));

export function publicCrmUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    chatwootAgentId: user.chatwootAgentId,
    permissions: [...user.permissions],
    ...(verifiedCustomerRequestIssuers.has(user)?{customerProductRequestIssuer:true}:{}),
    ...(verifiedAssignedStaffSessions.has(user)?{assignedStaffRefresh:true}:{}),
    ...(verifiedCleanNormalSessions.has(user)?{normalRefreshSession:true}:{}),
    ...(verifiedTerminalIdentities.has(user)?{terminalIdentity:verifiedTerminalIdentities.get(user)}:{}),
    ...(process.env.CRM_NORMAL_REFRESH_ENABLED==='true'&&process.env.CRM_ISOLATED_PREPARATION==='true'
      &&process.env.CRM_TEST_EXPECTED_DATABASE==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
      &&user.id===process.env.CRM_NORMAL_REFRESH_USER_ID&&isDedicatedNormalTestUser(user)
      ? {normalTestScope:{database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',isolatedPreparation:true,draftOnly:true,chatwootAgentId:3}} : {}),
    ...(semihTestContinueEnabled()&&isDedicatedSemihTestUser(user,Number(process.env.CRM_SEMIH_TEST_AGENT_ID))
      ? {normalTestScope:{database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',isolatedPreparation:true,draftOnly:true,semihTestContinue:true,chatwootAgentId:user.chatwootAgentId}} : {}),
    paidAiEnabled: process.env.CRM_PAID_AI_ENABLED === 'true' && process.env.CRM_ISOLATED_PREPARATION !== 'true',
    ...(user.testAdmin === true ? {testAdmin:true} : {}),
    ...(user.testPersonnel === true ? {testPersonnel:true,testPersonnelScope:user.testPersonnelScope} : {}),
    liveSendEnabled: Boolean(
      env.whatsapp.sendEnabled
      && (env.whatsapp.provider !== 'waapi' || waapiSendReady())
      && env.whatsapp.liveSendApproved
      && user.permissions.includes('crm.send'),
    ),
  };
}

export function findCrmUserById(id) {
  return listConfiguredCrmUsers().find((user) => user.id === String(id || '')) || null;
}

export function findCrmUserByUsername(username) {
  const normalized = normalizeUsername(username);
  return listConfiguredCrmUsers().find((user) => user.username === normalized) || null;
}

const normalRefreshStore = configuredNormalRefreshStore({resolveUser:findCrmUserById,authorizeManagedUser:managedUserAllowed});
const cleanNormalRefreshStore = process.env.CRM_TEST_PROFILE==='clean-synthetic-20261022'?normalRefreshStore:null;
const semihRefreshStore = configuredSemihTestRefreshStore({resolveUser:findCrmUserById});
const assignedStaffRefreshStore = configuredAssignedStaffRefreshStore({resolveUser:findCrmUserById});
const customerRequestIssuer = configuredCustomerRequestIssuerStore({resolveUser:findCrmUserById});
const terminalPeer = configuredTerminalHandoffPeer();
export const terminalHandoffEnabled=()=>Boolean(terminalPeer?.enabled());

export function customerRequestIssuerSessionsEnabled(){
  try{return Boolean(customerRequestIssuer&&customerRequestSharedConfig());}catch{return false;}
}

export function semihTestContinueEnabled(){
  return Boolean(semihRefreshStore&&normalRefreshStore&&process.env.CRM_NORMAL_REFRESH_ENABLED==='true'
    &&process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'&&process.env.CRM_ISOLATED_PREPARATION==='true'
    &&process.env.CRM_TEST_EXPECTED_DATABASE==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    &&process.env.CRM_NORMAL_REFRESH_USER_ID===DEDICATED_NORMAL_TEST_USER_ID);
}
function normalRefreshUserAllowed(user){
  try{return user.id===process.env.CRM_NORMAL_REFRESH_USER_ID&&normalRefreshUserPolicy()(user)||managedUserAllowed(user);}catch{return false;}
}
function semihRefreshUserAllowed(user){
  try{return semihTestContinueEnabled()&&semihRefreshUserPolicy()(user);}catch{return false;}
}
function refreshStoreForUser(user){
  if(customerRequestIssuer?.includes(user?.id))return customerRequestIssuer.allows(user)?customerRequestIssuer.store:null;
  if(assignedStaffRefreshStore&&user?.id===DEDICATED_ASSIGNED_STAFF_TEST_USER_ID)return assignedStaffRefreshStore;
  return user?.id===DEDICATED_SEMIH_TEST_USER_ID?(semihRefreshUserAllowed(user)?semihRefreshStore:null)
    :(normalRefreshUserAllowed(user)?normalRefreshStore:null);
}
export function rememberedSemihCrmUser(refreshToken){
  if(!semihTestContinueEnabled()||!refreshToken)return null;
  const user=semihRefreshStore.inspect(refreshToken);
  if(!isDedicatedSemihTestUser(user,Number(process.env.CRM_SEMIH_TEST_AGENT_ID)))throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  return publicCrmUser(user);
}

function normalLoginResult(user, grant = null, {maxExpiresAt} = {}) {
  let accessToken = jwt.sign(
    { username: user.username, role: user.role, ...(grant ? {normalSessionId:grant.sid} : {}) },
    env.auth.jwtSecret,
    {subject:user.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:env.auth.tokenExpiresIn,jwtid:crypto.randomUUID()},
  );
  if(maxExpiresAt!==undefined){
    if(!Number.isSafeInteger(maxExpiresAt)||maxExpiresAt<=Date.now())throw terminalReject();
    const payload=jwt.decode(accessToken);payload.exp=Math.min(payload.exp,Math.floor(maxExpiresAt/1000));
    if(payload.exp<=Math.floor(Date.now()/1000))throw terminalReject();
    accessToken=jwt.sign(payload,env.auth.jwtSecret);
  }
  const expiresAt=jwt.decode(accessToken).exp*1000;
  return {accessToken,tokenType:'Bearer',expiresIn:env.auth.tokenExpiresIn,user:publicCrmUser(verifyCrmAccessToken(accessToken)),
    ...(grant ? {refreshToken:grant.refreshToken,refreshExpiresAt:grant.refreshExpiresAt,expiresAt} : {})};
}

export function authenticateCrmUser({ username, password }) {
  const user = findCrmUserByUsername(username);
  const valid = verifyPassword(password, user?.passwordHash);
  if (!user || !user.active || !valid) {
    throw authError('WHATSAPP_CRM_LOGIN_FAILED', 'Kullanici adi veya parola hatali.', 401);
  }
  if(user.id===DEDICATED_SEMIH_TEST_USER_ID&&!semihRefreshUserAllowed(user)) {
    throw authError('AUTH_TOKEN_INVALID','Semih TEST oturumu bu ortamda kullanılamıyor.');
  }
  if (!env.auth.jwtSecret || env.auth.jwtSecret.length < 32) {
    throw authError('WHATSAPP_CRM_AUTH_SECRET_MISSING', 'CRM kimlik dogrulama anahtari yapilandirilmamis.', 503);
  }

  // A selected dedicated profile must pass its store policy; never fall back
  // to a grantless ordinary JWT when its role/assignment policy has changed.
  const store=customerRequestIssuer?.includes(user.id)?customerRequestIssuer.store
    :assignedStaffRefreshStore&&user.id===DEDICATED_ASSIGNED_STAFF_TEST_USER_ID?assignedStaffRefreshStore
    :user.id===DEDICATED_SEMIH_TEST_USER_ID?semihRefreshStore
    :normalRefreshStore&&(user.id===process.env.CRM_NORMAL_REFRESH_USER_ID||managedUserAllowed(user))?normalRefreshStore:null;
  const grant=store?store.issue(user):null;
  return normalLoginResult(user,grant);
}

function refreshStoreForToken(token,{includeRetired=false}={}){
  if(!normalRefreshStore&&!semihRefreshStore&&!customerRequestIssuer&&!assignedStaffRefreshStore)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  for(const store of [normalRefreshStore,semihRefreshStore,customerRequestIssuer?.store,assignedStaffRefreshStore])if(store?.ownsToken(token,{includeRetired}))return store;
  return null;
}
function refreshFromStore(store,token){
  if(!store)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  const grant=store.rotate(token);
  if(refreshStoreForUser(grant.user)!==store)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  return normalLoginResult(grant.user,grant);
}
export function refreshNormalCrmSession(refreshToken){
  const store=refreshStoreForToken(refreshToken);
  if(store?.terminalLinkForToken(refreshToken))throw terminalReject();
  return refreshFromStore(store,refreshToken);
}
export function refreshSemihCrmSession(refreshToken){return refreshFromStore(semihTestContinueEnabled()?semihRefreshStore:null,refreshToken);}

export function logoutNormalCrmSession(refreshToken) {
  return refreshStoreForToken(refreshToken,{includeRetired:true})?.revoke(refreshToken)||{loggedOut:true};
}
export function logoutCustomerRequestIssuerSession(accessToken){
  return logoutAccessSession(accessToken);
}
export function logoutNormalAccessSession(accessToken){
  return logoutAccessSession(accessToken,{allowAssignedStaff:true});
}
function logoutAccessSession(accessToken,{allowAssignedStaff=false}={}){
  const {user,authority}=captureNormalCrmAuthority(accessToken);
  const store=customerRequestIssuer?.includes(user.id)&&customerRequestIssuer.allows(user)?customerRequestIssuer.store
    :allowAssignedStaff&&assignedStaffRefreshStore&&user.id===DEDICATED_ASSIGNED_STAFF_TEST_USER_ID?assignedStaffRefreshStore
    :allowAssignedStaff&&cleanNormalRefreshStore&&(user.id===CLEAN_NORMAL_TEST_USER_ID||managedUserAllowed(user))?cleanNormalRefreshStore:null;
  if(!store)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  return store.revokeSession(authority.normalSessionId,user);
}
export function logoutSemihCrmSession(refreshToken){
  if(!semihTestContinueEnabled())throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  return semihRefreshStore.revoke(refreshToken);
}

export function verifyCrmAccessToken(token, { includeContext = false } = {}) {
  const testUser = verifyTestAdminSession(token, {includeContext}) || verifyTestPersonnelSession(token, {includeContext});
  if(testUser) return testUser;
  if (!env.auth.jwtSecret || env.auth.jwtSecret.length < 32) {
    throw authError('WHATSAPP_CRM_AUTH_SECRET_MISSING', 'CRM kimlik dogrulama anahtari yapilandirilmamis.', 503);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.auth.jwtSecret, {
      issuer: env.auth.issuer,
      audience: env.auth.audience,
    });
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw authError('AUTH_TOKEN_EXPIRED', 'Oturum suresi doldu. Lutfen tekrar giris yapin.', 401);
    }
    throw authError('AUTH_TOKEN_INVALID', 'Oturum dogrulanamadi. Lutfen tekrar giris yapin.', 401);
  }

  const user = findCrmUserById(payload.sub);
  if (!user || !user.active || user.username !== payload.username || user.role !== payload.role) {
    throw authError('AUTH_TOKEN_INVALID', 'CRM kullanicisi aktif degil veya yetkileri degisti.', 401);
  }
  if(user.id===DEDICATED_SEMIH_TEST_USER_ID&&(!semihRefreshUserAllowed(user)||!payload.normalSessionId))throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  if(assignedStaffRefreshStore&&user.id===DEDICATED_ASSIGNED_STAFF_TEST_USER_ID&&!payload.normalSessionId)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  if(cleanNormalRefreshStore&&user.id===CLEAN_NORMAL_TEST_USER_ID&&!payload.normalSessionId)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  if(user.managementRevision!==undefined&&!payload.normalSessionId)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  if(payload.normalSessionId){
    const store=refreshStoreForUser(user);
    if(!store)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
    const verified=store.verify(payload.normalSessionId,user,{includeTerminalLink:true});
    if(verified.terminalLink){
      if(store!==cleanNormalRefreshStore||verified.terminalLink.terminalIdentity.crmUserId!==user.id||verified.terminalLink.terminalIdentity.chatwootAgentId!==user.chatwootAgentId)throw terminalReject();
      linkedTerminalGrants.set(user,{store,sid:payload.normalSessionId,link:verified.terminalLink});
    }
    if(store===customerRequestIssuer?.store)verifiedCustomerRequestIssuers.add(user);
    if(store===assignedStaffRefreshStore)verifiedAssignedStaffSessions.add(user);
    if(store===cleanNormalRefreshStore)verifiedCleanNormalSessions.add(user);
  }
  return includeContext ? { user, expiresAt: Number.isFinite(payload.exp) ? payload.exp * 1000 : NaN } : user;
}

function terminalUser(proof){
  if(!isTerminalPeerProof(proof)||!terminalHandoffEnabled())throw terminalReject();
  const user=findCrmUserById(proof.terminalIdentity.crmUserId);
  if(!user?.active||!normalRefreshUserAllowed(user)||refreshStoreForUser(user)!==cleanNormalRefreshStore
    ||user.role!=='personel'||user.chatwootAgentId!==proof.terminalIdentity.chatwootAgentId)throw terminalReject();
  return user;
}
async function verifyTerminalLink(link){
  if(!terminalPeer)throw terminalReject();
  const proof=await terminalPeer.verify(link);terminalUser(proof);return proof;
}
async function closeTerminalGrant(store,grant,link){
  // Local own-family revoke is independent of ERP availability or current role.
  store.revoke(grant.refreshToken);
  if(terminalPeer)await terminalPeer.revoke(link);
}
export async function authenticateCrmTerminalHandoff(input){
  validateTerminalRequest(input);if(!terminalPeer)throw terminalReject();
  const proof=await terminalPeer.redeem(input);
  let grant;
  try{
    const user=terminalUser(proof);
    grant=cleanNormalRefreshStore.issue(user,{terminalLink:proof,maxExpiresAt:proof.linkExpiresAt});
    const fresh=await verifyTerminalLink(proof),actual=terminalUser(fresh);
    cleanNormalRefreshStore.verify(grant.sid,actual);
    const result=normalLoginResult(actual,grant,{maxExpiresAt:fresh.linkExpiresAt});
    result.user.terminalIdentity=fresh.terminalIdentity;return result;
  }catch(error){
    if(grant)await closeTerminalGrant(cleanNormalRefreshStore,grant,proof).catch(()=>{});
    else await terminalPeer.revoke(proof).catch(()=>{});
    throw error;
  }
}
/** Extra asynchronous authority check at the HTTP boundary, never a cached role. */
export async function verifyTerminalCrmSession(user){
  const binding=linkedTerminalGrants.get(user);if(!binding)return user;
  try{
    const proof=await verifyTerminalLink(binding.link);
    const current=binding.store.verify(binding.sid,user,{includeTerminalLink:true});
    if(!current.terminalLink||terminalIdentityKey(current.terminalLink.terminalIdentity)!==terminalIdentityKey(proof.terminalIdentity)
      ||current.terminalLink.linkId!==proof.linkId)throw terminalReject();
    verifiedTerminalIdentities.set(user,proof.terminalIdentity);return user;
  }catch(error){
    if([401,403].includes(error.statusCode))binding.store.revokeSession(binding.sid,user);
    throw error;
  }
}
export async function refreshNormalCrmSessionVerified(refreshToken){
  const store=refreshStoreForToken(refreshToken);if(!store)throw authError('AUTH_TOKEN_INVALID','Yeniden giriş yapın.');
  const link=store.terminalLinkForToken(refreshToken);
  if(!link)return refreshFromStore(store,refreshToken);
  let grant;
  try{
    const before=await verifyTerminalLink(link);terminalUser(before);
    grant=store.rotate(refreshToken);
    const fresh=await verifyTerminalLink(link),actual=terminalUser(fresh);store.verify(grant.sid,actual);
    const result=normalLoginResult(actual,grant,{maxExpiresAt:fresh.linkExpiresAt});result.user.terminalIdentity=fresh.terminalIdentity;return result;
  }catch(error){
    if(grant)await closeTerminalGrant(store,grant,link).catch(()=>{});
    else if([401,403].includes(error.statusCode))store.revoke(refreshToken);
    throw error;
  }
}
export async function logoutNormalCrmSessionVerified(refreshToken){
  const store=refreshStoreForToken(refreshToken,{includeRetired:true});
  const link=store?.terminalLinkForToken(refreshToken,{includeRetired:true,includeRevoked:true});
  const result=store?.revoke(refreshToken)||{loggedOut:true};
  if(link){if(!terminalPeer)throw terminalReject();await terminalPeer.revoke(link);}return result;
}
export async function logoutNormalAccessSessionVerified(accessToken){
  const user=verifyCrmAccessToken(accessToken),binding=linkedTerminalGrants.get(user);
  const result=logoutNormalAccessSession(accessToken);
  if(binding){if(!terminalPeer)throw terminalReject();await terminalPeer.revoke(binding.link);}return result;
}

export function assertCrmPermission(user, permissionKey) {
  if (!user?.permissions?.includes(permissionKey)) {
    throw authError('WHATSAPP_CRM_PERMISSION_DENIED', `Permission required: ${permissionKey}`, 403);
  }
}

// Internal read-only authority reference for a narrowly scoped TEST customer
// capability. It never contains a JWT/refresh secret and cannot mint a login.
export function captureNormalCrmAuthority(token) {
  const context = verifyCrmAccessToken(token, { includeContext: true });
  const user = context?.user;
  // Decode only after normal verification; anonymous TEST actors cannot issue
  // customer capabilities even if their displayed role is administrator.
  if (!user || user.testAdmin || user.testPersonnel) throw authError('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED', 'Normal CRM oturumu gerekli.');
  const payload = jwt.decode(token);
  const normalSessionId = payload?.normalSessionId;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(normalSessionId || '')
    || !Number.isSafeInteger(context.expiresAt) || context.expiresAt <= Date.now()) throw authError('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED', 'Korumalı normal CRM oturumu gerekli.');
  const authority = { id: user.id, normalSessionId, fingerprint: normalSessionFingerprint(user), expiresAt: context.expiresAt };
  verifyNormalCrmAuthority(authority);
  return { user, authority };
}

export function verifyNormalCrmAuthority(authority) {
  if (!authority || Array.isArray(authority) || Object.keys(authority).length !== 4
    || !['id', 'normalSessionId', 'fingerprint', 'expiresAt'].every(key => Object.hasOwn(authority, key))
    || typeof authority.id !== 'string' || !authority.id
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(authority.normalSessionId || '')
    || !/^[a-f0-9]{64}$/.test(authority.fingerprint || '') || !Number.isSafeInteger(authority.expiresAt) || authority.expiresAt <= Date.now()) throw authError('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED', 'Normal CRM oturumu sona erdi.');
  const user = findCrmUserById(authority.id), store = user && refreshStoreForUser(user);
  if (!user?.active || user.testAdmin || user.testPersonnel || !store || normalSessionFingerprint(user) !== authority.fingerprint) throw authError('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED', 'Normal CRM oturumu değişti.');
  store.verify(authority.normalSessionId, user);
  return user;
}

export function canAccessConversation(user, conversation) {
  if (!user || !conversation) return false;
  if (user.role !== 'personel') return true;
  return Boolean(user.chatwootAgentId)
    && Number(conversation.chatwootAgentId) === Number(user.chatwootAgentId);
}

export function assertConversationAccess(user, conversation) {
  if (!canAccessConversation(user, conversation)) {
    throw authError('WHATSAPP_CRM_CONVERSATION_FORBIDDEN', 'Bu konusma bu personele atanmamis.', 403);
  }
  return conversation;
}

export function createPasswordHash(password, salt = crypto.randomBytes(24).toString('hex')) {
  const value = String(password || '');
  if (value.length < 16) {
    throw authError('WHATSAPP_CRM_PASSWORD_WEAK', 'CRM parolasi en az 16 karakter olmalidir.', 400);
  }
  return `scrypt$${salt}$${crypto.scryptSync(value, salt, 64).toString('hex')}`;
}
