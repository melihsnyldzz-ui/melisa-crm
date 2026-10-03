import {createHash} from 'node:crypto';
const ROLES=new Set(['patron','mudur','personel']);
const bearer=request=>request.headers.get('authorization')||'';
const tokenKey=(user,authorization)=>user?.id&&/^Bearer [^\s]+$/.test(authorization)?`${user.id}:${createHash('sha256').update(authorization).digest('hex')}`:null;
export function createCatalogAccess({activationApproved=false,now=Date.now,maxTombstones=1024,maxConcurrentReads=128}={}){
  const revoked=new Map(),active=new Map();let stopping=false;
  const base=user=>activationApproved&&!stopping&&user?.active===true&&ROLES.has(user.role)&&Array.isArray(user.permissions)&&user.permissions.includes('crm.view');
  const purge=()=>{for(const[key,expiresAt]of revoked)if(expiresAt<=now())revoked.delete(key)};
  function isRevoked(user,authorization){purge();const key=tokenKey(user,authorization);return !!key&&revoked.has(key)}
  function canRead(user,authorization){return base(user)&&!!tokenKey(user,authorization)&&!isRevoked(user,authorization)}
  function revoke(context,request){
    purge();const key=tokenKey(context?.user,bearer(request));
    if(!base(context?.user)||!key||!Number.isFinite(context.expiresAt)||context.expiresAt<=now())throw Object.assign(Error('CURRENT_CRM_SESSION_REQUIRED'),{status:401});
    if(!revoked.has(key)&&revoked.size>=maxTombstones)throw Object.assign(Error('CATALOG_SESSION_LIMIT'),{status:503});
    revoked.set(key,context.expiresAt);for(const lease of active.get(key)||[])lease.controller.abort();
  }
  function lease(context,request,verifyContext){
    const authorization=bearer(request),key=tokenKey(context?.user,authorization);
    if(!canRead(context?.user,authorization)||!key||!Number.isFinite(context.expiresAt)||context.expiresAt<=now())return null;
    if([...active.values()].reduce((count,set)=>count+set.size,0)>=maxConcurrentReads)throw Object.assign(Error('CATALOG_SESSION_LIMIT'),{status:503});
    const record={controller:new AbortController()};let released=false;
    if(!active.has(key))active.set(key,new Set());active.get(key).add(record);
    const expiryTimer=setTimeout(()=>record.controller.abort(),Math.max(1,Math.min(2147483647,context.expiresAt-now())));expiryTimer.unref?.();
    const release=()=>{if(released)return;released=true;clearTimeout(expiryTimer);const set=active.get(key);set?.delete(record);if(set?.size===0)active.delete(key)};
    return{crmActorId:String(context.user.id),authorization,expiresAt:context.expiresAt,signal:record.controller.signal,release,
      isCurrent:()=>{try{const current=verifyContext(authorization.slice(7));return !record.controller.signal.aborted&&context.expiresAt>now()&&current?.expiresAt>now()&&String(current.user?.id)===String(context.user.id)&&canRead(current.user,authorization)}catch{return false}}};
  }
  function clearAll(){stopping=true;for(const set of active.values())for(const record of set)record.controller.abort();active.clear();revoked.clear()}
  return{base,canRead,isRevoked,revoke,lease,clearAll};
}
// User explicitly approved this role-wide catalog boundary. No ERP credentials or tokens are stored.
export const catalogAccess=createCatalogAccess({activationApproved:true});
