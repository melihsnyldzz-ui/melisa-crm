import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const reject = () => Object.assign(new Error('Oturum sona erdi. Yeniden giriş yapın.'), {code:'AUTH_TOKEN_INVALID',statusCode:401});
export const DEDICATED_NORMAL_TEST_USER_ID='crm-agent-test-20261011';
export function isDedicatedNormalTestUser(user) {
  return user?.id===DEDICATED_NORMAL_TEST_USER_ID&&user.username==='crm-agent-test'&&user.role==='personel'
    &&user.active===true&&user.chatwootAgentId===3&&Array.isArray(user.permissions)
    &&user.permissions.length===1&&user.permissions[0]==='crm.view'&&!user.testAdmin&&!user.testPersonnel;
}
export function normalSessionFingerprint(user) {
  return hash(JSON.stringify([user.id,user.username,user.role,user.active,user.chatwootAgentId,[...user.permissions].sort(),user.passwordHash]));
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
      ||(g.retiredHashes!==undefined&&(!Array.isArray(g.retiredHashes)||g.retiredHashes.length>2048||g.retiredHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))))) )throw reject();
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
    issue(user){return mutate(data=>{
      if(!user?.active||!authorizeUser(user))throw reject();const refreshToken=random(),sid=crypto.randomUUID(),expiresAt=now()+ttlMs;
      if(data.grants.length>=10000)throw reject();
      data.grants.push({sid,userId:String(user.id),fingerprint:normalSessionFingerprint(user),tokenHash:tokenHash(refreshToken),retiredHashes:[],expiresAt,revoked:false});
      return {sid,refreshToken,refreshExpiresAt:expiresAt};
    });},
    rotate(token){return mutate(data=>{
      const grant=data.grants.find(g=>g.tokenHash===tokenHash(token));const user=current(grant),refreshToken=random();
      grant.retiredHashes??=[];if(grant.retiredHashes.length>=2048)throw reject();grant.retiredHashes.push(grant.tokenHash);
      grant.tokenHash=tokenHash(refreshToken);return {sid:grant.sid,user,refreshToken,refreshExpiresAt:grant.expiresAt};
    });},
    verify(sid,user){const grant=read().grants.find(g=>g.sid===sid);const actual=current(grant);if(actual.id!==user.id||!authorizeUser(user))throw reject();return actual;},
    // A simultaneous logout can hold the token retired by an in-flight refresh.
    // Retired hashes may revoke their own family but never rotate it again.
    revoke(token){return mutate(data=>{const digest=tokenHash(token),grant=data.grants.find(g=>g.tokenHash===digest||g.retiredHashes?.includes(digest));if(grant)grant.revoked=true;return {loggedOut:true};});},
  };
}

export function configuredNormalRefreshStore({config=process.env,resolveUser,repoRoot=process.cwd()}={}) {
  if(config.CRM_NORMAL_REFRESH_ENABLED!=='true')return null;
  const file=config.CRM_NORMAL_REFRESH_JOURNAL_PATH;
  const privateRoot=path.resolve('C:/Sirket/CRM/runtime');
  const relative=file&&path.relative(privateRoot,path.resolve(file));
  const repoRelative=file&&path.relative(path.resolve(repoRoot),path.resolve(file));
  if(config.CRM_ISOLATED_PREPARATION!=='true'||config.CRM_TEST_EXPECTED_DATABASE!=='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    ||!file||!path.isAbsolute(file)||!relative||relative.startsWith('..')||path.isAbsolute(relative)
    ||!repoRelative.startsWith('..')||config.CRM_NORMAL_REFRESH_USER_ID!==DEDICATED_NORMAL_TEST_USER_ID)throw Error('Isolated normal-session configuration is invalid.');
  return createNormalRefreshStore({file,resolveUser,authorizeUser:isDedicatedNormalTestUser});
}
