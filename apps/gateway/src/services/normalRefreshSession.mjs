import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {validateTerminalLink} from '../../../../packages/contracts/terminal-handoff.mjs';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const reject = () => Object.assign(new Error('Oturum sona erdi. Yeniden giriş yapın.'), {code:'AUTH_TOKEN_INVALID',statusCode:401});
export const DEDICATED_NORMAL_TEST_USER_ID='crm-agent-test-20261011';
export const DEDICATED_SEMIH_TEST_USER_ID='crm-semih-test-20261012';
export const CLEAN_NORMAL_TEST_USER_ID='clean-staff-20261022';
export const CLEAN_NORMAL_REFRESH_JOURNAL='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';
const SEMIH_TEST_PERMISSIONS=Object.freeze(['crm.view','crm.send','crm.assign','crm.agents','crm.manage']);
export function isDedicatedNormalTestUser(user) {
  return user?.id===DEDICATED_NORMAL_TEST_USER_ID&&user.username==='crm-agent-test'&&user.role==='personel'
    &&user.active===true&&user.chatwootAgentId===3&&Array.isArray(user.permissions)
    &&user.permissions.length===1&&user.permissions[0]==='crm.view'&&!user.testAdmin&&!user.testPersonnel;
}
export function isDedicatedSemihTestUser(user,agentId) {
  return user?.id===DEDICATED_SEMIH_TEST_USER_ID&&user.username==='crm-semih-test'&&user.displayName==='Semih TEST'
    &&user.role==='patron'&&user.active===true&&Number.isSafeInteger(agentId)&&agentId>0&&user.chatwootAgentId===agentId
    &&Array.isArray(user.permissions)&&user.permissions.length===SEMIH_TEST_PERMISSIONS.length
    &&SEMIH_TEST_PERMISSIONS.every(permission=>user.permissions.includes(permission))&&!user.testAdmin&&!user.testPersonnel;
}
export function normalRefreshUserPolicy(config=process.env) {
  if(config.CRM_TEST_PROFILE)return cleanNormalRefreshUserPolicy(config);
  if(config.CRM_NORMAL_REFRESH_USER_ID===DEDICATED_NORMAL_TEST_USER_ID)return isDedicatedNormalTestUser;
  throw Error('Isolated normal-session identity is invalid.');
}

// Reuse the existing normal grant engine for one already configured synthetic
// CRM account. This policy neither maps an ERP identity nor creates an account.
function cleanNormalRefreshScope(config) {
  const required={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_ISOLATED_PREPARATION:'true',
    CRM_TEST_PORT_BASE:'62800',CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',
    CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',CRM_NORMAL_REFRESH_ENABLED:'true',
    CRM_NORMAL_REFRESH_USER_ID:CLEAN_NORMAL_TEST_USER_ID,CRM_NORMAL_REFRESH_JOURNAL_PATH:CLEAN_NORMAL_REFRESH_JOURNAL,
    WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false'};
  const peers=['CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED','CRM_CUSTOMER_PRODUCT_REQUEST_PROOF',
    'CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_ASSIGNED_STAFF_REFRESH_ENABLED'];
  const journals=['CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH','CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH',
    'CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE','CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH'];
  if(Object.entries(required).some(([key,value])=>config[key]!==value)
    ||peers.some(key=>!['false','',undefined].includes(config[key]))
    ||journals.some(key=>config[key]&&(typeof config[key]!=='string'
      ||config[key].replaceAll('\\','/').split('/').slice(1).some(segment=>/[. ]$/.test(segment)||segment.includes(':'))
      ||path.win32.normalize(config[key]).toLowerCase()===path.win32.normalize(CLEAN_NORMAL_REFRESH_JOURNAL).toLowerCase())))
    throw Error('Clean normal-session configuration is invalid.');
  return JSON.stringify([...Object.keys(required),...peers,...journals].map(key=>config[key]??null));
}
function cleanNormalRefreshUserPolicy(config) {
  const snapshot=cleanNormalRefreshScope(config);
  return user=>{
    try{return cleanNormalRefreshScope(config)===snapshot&&user?.id===CLEAN_NORMAL_TEST_USER_ID
      &&user.username==='ornek-personel'&&user.role==='personel'&&user.active===true&&user.chatwootAgentId===2
      &&Array.isArray(user.permissions)&&user.permissions.length===2
      &&user.permissions.includes('crm.view')&&user.permissions.includes('crm.send')&&!user.testAdmin&&!user.testPersonnel;}
    catch{return false;}
  };
}
export function semihRefreshUserPolicy(config=process.env){
  const agentId=Number(config.CRM_SEMIH_TEST_AGENT_ID);
  if(config.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'&&Number.isSafeInteger(agentId)&&agentId>0)return user=>isDedicatedSemihTestUser(user,agentId);
  throw Error('Isolated Semih-session identity is invalid.');
}
export function normalSessionFingerprint(user) {
  return hash(JSON.stringify([user.id,user.username,user.role,user.active,user.chatwootAgentId,[...user.permissions].sort(),user.passwordHash,...(user.managementRevision===undefined?[]:[user.managementRevision])]));
}

// Opaque refresh secrets never reach disk. Atomic replacement and an exclusive
// mutation lock preserve the existing journal when a write fails or races.
export function createNormalRefreshStore({file,resolveUser,authorizeUser=()=>true,now=Date.now,random=()=>crypto.randomBytes(32).toString('base64url'),ttlMs=30*86400000}) {
  if(!path.isAbsolute(file)||typeof resolveUser!=='function')throw Error('Normal session storage is not configured.');
  const read=()=>{
    let data;
    try{data=JSON.parse(fs.readFileSync(file,'utf8'));}
    catch(error){if(error.code==='ENOENT')return {schema:1,grants:[]};throw reject();}
    if(data.schema!==1||!Array.isArray(data.grants)||data.grants.length>10000||data.grants.some(g=>!g||typeof g.sid!=='string'||!/^[a-f0-9]{64}$/.test(g.tokenHash||'')||!/^[a-f0-9]{64}$/.test(g.fingerprint||'')||typeof g.userId!=='string'||!Number.isSafeInteger(g.expiresAt)||typeof g.revoked!=='boolean'
      ||(g.retiredHashes!==undefined&&(!Array.isArray(g.retiredHashes)||g.retiredHashes.length>2048||g.retiredHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))))
      ||(g.terminalLink!==undefined&&(()=>{try{validateTerminalLink(g.terminalLink);return false;}catch{return true;}})())) )throw reject();
    return data;
  };
  const mutate=fn=>{
    const lock=`${file}.lock`;let fd,temporary;
    try{
      fs.mkdirSync(path.dirname(file),{recursive:true});fd=fs.openSync(lock,'wx',0o600);
      const data=read(),result=fn(data);temporary=`${file}.${crypto.randomUUID()}.tmp`;
      const writeFd=fs.openSync(temporary,'wx',0o600);
      try{fs.writeFileSync(writeFd,JSON.stringify(data));fs.fsyncSync(writeFd);}finally{fs.closeSync(writeFd);}
      fs.renameSync(temporary,file);temporary=null;return result;
    }catch(error){if(error.statusCode)throw error;throw Object.assign(new Error('Oturum kaydı kullanılamıyor. Yeniden deneyin.'),{code:'AUTH_SESSION_STORAGE_UNAVAILABLE',statusCode:503});}
    finally{if(temporary)try{fs.unlinkSync(temporary);}catch{}if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
  };
  const current=grant=>{
    const user=grant&&resolveUser(grant.userId);
    if(!grant||grant.revoked||grant.expiresAt<=now()||!user?.active||!authorizeUser(user)||normalSessionFingerprint(user)!==grant.fingerprint)throw reject();
    return user;
  };
  const tokenHash=token=>{if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw reject();return hash(token);};
  return {
    issue(user,{terminalLink,maxExpiresAt}={}){return mutate(data=>{
      if(!user?.active||!authorizeUser(user))throw reject();const refreshToken=random(),sid=crypto.randomUUID(),expiresAt=now()+ttlMs;
      if(terminalLink){validateTerminalLink(terminalLink,{now:now(),fresh:true});if(maxExpiresAt!==terminalLink.linkExpiresAt||!Number.isSafeInteger(maxExpiresAt)||maxExpiresAt<=now())throw reject();}
      else if(maxExpiresAt!==undefined)throw reject();
      if(data.grants.length>=10000)throw reject();
      const until=terminalLink?Math.min(expiresAt,maxExpiresAt):expiresAt;
      data.grants.push({sid,userId:String(user.id),fingerprint:normalSessionFingerprint(user),tokenHash:tokenHash(refreshToken),retiredHashes:[],expiresAt:until,revoked:false,...(terminalLink?{terminalLink}: {})});
      return {sid,refreshToken,refreshExpiresAt:until};
    });},
    rotate(token){return mutate(data=>{
      const grant=data.grants.find(g=>g.tokenHash===tokenHash(token));const user=current(grant),refreshToken=random();
      grant.retiredHashes??=[];if(grant.retiredHashes.length>=2048)throw reject();grant.retiredHashes.push(grant.tokenHash);
      grant.tokenHash=tokenHash(refreshToken);return {sid:grant.sid,user,refreshToken,refreshExpiresAt:grant.expiresAt};
    });},
    inspect(token){return current(read().grants.find(g=>g.tokenHash===tokenHash(token)));},
    ownsToken(token,{includeRetired=false}={}){const digest=tokenHash(token);return read().grants.some(g=>g.tokenHash===digest||(includeRetired&&g.retiredHashes?.includes(digest)));},
    verify(sid,user,{includeTerminalLink=false}={}){const grant=read().grants.find(g=>g.sid===sid);const actual=current(grant);if(actual.id!==user.id||!authorizeUser(user))throw reject();return includeTerminalLink?{user:actual,terminalLink:grant.terminalLink?structuredClone(grant.terminalLink):null}:actual;},
    terminalLinkForSession(sid,user){const grant=read().grants.find(g=>g.sid===sid),actual=current(grant);if(actual.id!==user?.id||!authorizeUser(user))throw reject();return grant.terminalLink?structuredClone(grant.terminalLink):null;},
    terminalLinkForToken(token,{includeRetired=false,includeRevoked=false}={}){
      const digest=tokenHash(token),grant=read().grants.find(g=>g.tokenHash===digest||(includeRetired&&g.retiredHashes?.includes(digest)));
      if(!grant)return null;if(!includeRevoked)current(grant);
      return grant.terminalLink?structuredClone(grant.terminalLink):null;
    },
    // A simultaneous logout can hold the token retired by an in-flight refresh.
    // Retired hashes may revoke their own family but never rotate it again.
    revoke(token){return mutate(data=>{const digest=tokenHash(token),grant=data.grants.find(g=>g.tokenHash===digest||g.retiredHashes?.includes(digest));if(grant)grant.revoked=true;return {loggedOut:true};});},
    // A password-issued access JWT can close only its own currently valid
    // family after a browser reload lost the RAM-only refresh secret.
    revokeSession(sid,user){return mutate(data=>{
      const grant=data.grants.find(value=>value.sid===sid),actual=current(grant);
      if(actual.id!==user?.id||!authorizeUser(user)||normalSessionFingerprint(user)!==grant.fingerprint)throw reject();
      grant.revoked=true;return {loggedOut:true};
    });},
  };
}

export function assertPrivateRefreshJournal(file,config,repoRoot){
  const privateRoot=path.resolve('C:/Sirket/CRM/runtime');
  const relative=file&&path.relative(privateRoot,path.resolve(file));
  const repoRelative=file&&path.relative(path.resolve(repoRoot),path.resolve(file));
  if(config.CRM_ISOLATED_PREPARATION!=='true'||config.CRM_TEST_EXPECTED_DATABASE!=='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    ||!file||!path.isAbsolute(file)||!relative||relative.startsWith('..')||path.isAbsolute(relative)
    ||!repoRelative.startsWith('..'))throw Error('Isolated normal-session configuration is invalid.');
}
export function configuredNormalRefreshStore({config=process.env,resolveUser,repoRoot=process.cwd(),authorizeManagedUser}={}) {
  if(config.CRM_NORMAL_REFRESH_ENABLED!=='true')return null;
  const file=config.CRM_NORMAL_REFRESH_JOURNAL_PATH;
  if(config.CRM_TEST_PROFILE){
    const original=normalRefreshUserPolicy(config),snapshot=cleanNormalRefreshScope(config);
    const authorizeUser=user=>{
      try{return original(user)||(cleanNormalRefreshScope(config)===snapshot&&typeof authorizeManagedUser==='function'&&authorizeManagedUser(user)===true);}
      catch{return false;}
    };
    const relative=path.win32.relative(path.win32.resolve(repoRoot),CLEAN_NORMAL_REFRESH_JOURNAL);
    if(!relative.startsWith('..')||typeof resolveUser!=='function'||!authorizeUser(resolveUser(CLEAN_NORMAL_TEST_USER_ID)))
      throw Error('Clean normal-session identity is invalid.');
    return createNormalRefreshStore({file,resolveUser,authorizeUser});
  }
  assertPrivateRefreshJournal(file,config,repoRoot);
  const authorizeUser=normalRefreshUserPolicy(config);
  return createNormalRefreshStore({file,resolveUser,authorizeUser:user=>{
    // Configuration changes, as well as identity/password changes, revoke access.
    try{return config.CRM_NORMAL_REFRESH_ENABLED==='true'&&config.CRM_ISOLATED_PREPARATION==='true'
      &&config.CRM_TEST_EXPECTED_DATABASE==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
      &&normalRefreshUserPolicy(config)(user)&&authorizeUser(user);}catch{return false;}
  }});
}
export function configuredSemihTestRefreshStore({config=process.env,resolveUser,repoRoot=process.cwd()}={}){
  if(config.CRM_SEMIH_TEST_CONTINUE_ENABLED!=='true')return null;
  const file=config.CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH;
  assertPrivateRefreshJournal(file,config,repoRoot);
  if(config.CRM_NORMAL_REFRESH_ENABLED!=='true'||config.CRM_NORMAL_REFRESH_USER_ID!==DEDICATED_NORMAL_TEST_USER_ID
    ||!config.CRM_NORMAL_REFRESH_JOURNAL_PATH||path.resolve(file).toLowerCase()===path.resolve(config.CRM_NORMAL_REFRESH_JOURNAL_PATH).toLowerCase())throw Error('Separate Semih-session journal is required.');
  assertPrivateRefreshJournal(config.CRM_NORMAL_REFRESH_JOURNAL_PATH,config,repoRoot);
  const authorizeUser=semihRefreshUserPolicy(config);
  return createNormalRefreshStore({file,resolveUser,authorizeUser:user=>{
    try{return config.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'&&config.CRM_NORMAL_REFRESH_ENABLED==='true'
      &&config.CRM_NORMAL_REFRESH_USER_ID===DEDICATED_NORMAL_TEST_USER_ID&&config.CRM_ISOLATED_PREPARATION==='true'
      &&config.CRM_TEST_EXPECTED_DATABASE==='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
      &&semihRefreshUserPolicy(config)(user)&&authorizeUser(user);}catch{return false;}
  }});
}
