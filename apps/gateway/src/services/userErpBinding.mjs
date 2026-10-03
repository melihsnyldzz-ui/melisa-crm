// Development-only normal interactive login binding. No listener, env, persistent store or default transport.
// Hosted runtime must supply fresh CRM verification (including verified JWT expiry) and exact UI origin.
import { createHash } from 'node:crypto';
import { ERP_ORIGIN as ERP } from './erpSourceContract.mjs';
const ROOT = '/crm/catalog/auth';
const error = (status, code) => Response.json({ success: false, error: { code, message: code } }, {status,headers:{'cache-control':'no-store'}});
const id = value => (typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value > 0);
function ttl(value) {
  if(typeof value === 'number' && Number.isFinite(value) && value > 0) return value*1000;
  const match = typeof value === 'string' && /^([1-9][0-9]*)(s|m|h|d)$/.exec(value);
  return match ? +match[1]*{s:1000,m:60000,h:3600000,d:86400000}[match[2]] : null;
}
async function boundedJSON(response, max) {
  if(!response.headers.get('content-type')?.startsWith('application/json') || !response.body) throw Error('JSON_REQUIRED');
  const reader=response.body.getReader();let n=0;const parts=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw Error('BODY_LIMIT');}parts.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}return JSON.parse(new TextDecoder().decode(bytes));
}
export function createUserErpBinding({ activationApproved=false, transport, authorizeCrm, uiOrigin, now=Date.now, maxLifetimeMs=900000, maxBindings=32 }={}) {
  if(activationApproved && (typeof transport!=='function'||typeof authorizeCrm!=='function'||!/^https:\/\/[A-Za-z0-9.-]+$/.test(uiOrigin||''))) throw Error('EXPLICIT_SECURE_ORIGIN_AUTH_TRANSPORT_REQUIRED');
  const bindings=new Map();const generations=new Map();
  const key=(actor,request)=>{const bearer=request.headers.get('authorization');return id(actor?.id)&&/^Bearer [^\s]+$/.test(bearer||'') ? `${actor.id}:${createHash('sha256').update(bearer).digest('hex')}` : null};
  function revoke(k){const v=bindings.get(k);if(v){v.controller.abort();clearTimeout(v.expiryTimer);bindings.delete(k)}}
  function purge(){for(const [k,v]of bindings)if(v.expiresAt<=now())revoke(k)}
  async function call(path,authorization,body){const r=await transport(new URL(path,ERP),{method:body?'POST':'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(authorization?{authorization}: {})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok||r.status>=300&&r.status<400)return {status:r.status};const payload=await boundedJSON(r,65536);return {status:r.status,payload};}
  const resolveErpSession=async(actor,request)=>{purge();const k=key(actor,request);const v=k&&bindings.get(k);if(!v||v.expiresAt<=now())return null;return {crmActorId:v.crmActorId,erpActorId:v.erpActorId,authorization:v.authorization,expiresAt:v.expiresAt,signal:v.controller.signal,isCurrent:()=>bindings.get(k)===v&&generations.get(k)===v.revision&&v.expiresAt>now()&&!v.controller.signal.aborted}};
  const clearActor=actorId=>{for(const k of new Set([...bindings.keys(),...generations.keys()]))if(k.startsWith(`${actorId}:`)){generations.set(k,(generations.get(k)||0)+1);revoke(k)}};
  const clearAll=()=>{for(const k of new Set([...bindings.keys(),...generations.keys()])){generations.set(k,(generations.get(k)||0)+1);revoke(k)}};
  async function handle(request){
    const u=new URL(request.url);if(![`${ROOT}/sign-in`,`${ROOT}/sign-out`].includes(u.pathname))return error(404,'ROUTE_NOT_ALLOWED');
    if(request.method!=='POST')return error(405,'AUTH_POST_ONLY');if(u.search)return error(400,'NO_QUERY');
    if(!activationApproved)return error(503,'SIGN_IN_NOT_ACTIVATED');
    if(request.headers.get('origin')!==uiOrigin)return error(403,'SAME_UI_ORIGIN_REQUIRED');
    try{
      const actor=await authorizeCrm(request);const k=key(actor,request);
      if(!k||actor.catalogReadApproved!==true||!actor.permissions?.includes('crm.view')||!Number.isFinite(actor.expiresAt)||actor.expiresAt<=now())return error(403,'CURRENT_CRM_SCOPE_AND_EXPIRY_REQUIRED');
      purge();const revision=(generations.get(k)||0)+1;generations.set(k,revision);revoke(k);
      if(u.pathname.endsWith('/sign-out')){
        const logoutBody=await boundedJSON(request,1024);
        if(!logoutBody||Array.isArray(logoutBody)||typeof logoutBody!=='object'||Object.keys(logoutBody).length)return error(400,'EMPTY_SIGN_OUT_OBJECT_REQUIRED');
        return Response.json({success:true,data:{connected:false}},{headers:{'cache-control':'no-store'}});
      }
      if(bindings.size>=maxBindings)return error(429,'BINDING_LIMIT');
      const body=await boundedJSON(request,16384);
      if(!body||Object.keys(body).sort().join(',')!=='password,username'||typeof body.username!=='string'||!body.username.trim()||body.username.length>128||typeof body.password!=='string'||!body.password||body.password.length>1024)return error(400,'NORMAL_LOGIN_FIELDS_REQUIRED');
      const loginStarted=now();
      const login=await call('/api/auth/login',undefined,body); // Normal user login only, never admin/passwordless/refresh.
      if(login.status!==200||login.payload?.success!==true)return error(login.status>=400?login.status:502,'ERP_LOGIN_REJECTED');
      const d=login.payload.data;const duration=ttl(d?.expiresIn);
      if(typeof d?.accessToken!=='string'||!d.accessToken||/\s/.test(d.accessToken)||d.tokenType!=='Bearer'||!id(d.user?.id)||!duration)return error(502,'LOGIN_CONTRACT_REQUIRED');
      const authorization=`Bearer ${d.accessToken}`;const me=await call('/api/auth/me',authorization);
      if(me.status!==200||me.payload?.success!==true||String(me.payload.data?.id)!==String(d.user.id)||!me.payload.data?.permissions?.includes('product.view'))return error(403,'ERP_PRODUCT_PERMISSION_REQUIRED');
      if(generations.get(k)!==revision||actor.expiresAt<=now())return error(409,'SESSION_CONTEXT_CHANGED');
      const expiresAt=Math.min(loginStarted+duration,loginStarted+maxLifetimeMs,actor.expiresAt);
      if(expiresAt<=now())return error(401,'ERP_SESSION_EXPIRED');
      const entry={crmActorId:actor.id,erpActorId:d.user.id,authorization,expiresAt,revision,controller:new AbortController()};
      bindings.set(k,entry);
      entry.expiryTimer=setTimeout(()=>{if(bindings.get(k)===entry)revoke(k)},expiresAt-now());entry.expiryTimer.unref?.();
      // Only connection metadata reaches browser. ERP access/refresh tokens and raw user object never do.
      return Response.json({success:true,data:{connected:true,expiresAt:new Date(expiresAt).toISOString(),permissions:['product.view']}},{headers:{'cache-control':'no-store'}});
    }catch{return error(502,'NORMAL_SIGN_IN_UNAVAILABLE')}
  }
  return {handle,resolveErpSession,clearActor,clearAll};
}
