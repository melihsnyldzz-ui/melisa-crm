import {terminalEntry} from './terminalNavigation.js';

const fields=['version','environmentId','database','erpOrigin','crmOrigin','erpUserId','erpNormalSessionId','crmUserId','chatwootAgentId','bindingRevision','expiresAt'];
const unavailable=()=>Object.assign(Error('Terminal hesabının CRM bağlantısı doğrulanamadı. ERP oturumunu kontrol edin.'),{status:403,code:'CRM_TERMINAL_IDENTITY_REQUIRED'});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function linkedTerminalContext(host=globalThis.window){
 const entry=terminalEntry(host?.location);
 return Boolean(entry.enabled&&entry.erpOrigin&&['http://127.0.0.1:62800','http://192.168.1.46:62800'].includes(host?.location?.origin)&&host.parent&&host.parent!==host);
}

// This is an authenticated server read, never a parent/native user-ID claim.
// It cannot issue a login, create a relation, or change CRM permissions.
export function terminalIdentity(value,user,location,now=Date.now()){
 const entry=terminalEntry(location);
 if(!entry.enabled||!entry.erpOrigin||!['http://127.0.0.1:62800','http://192.168.1.46:62800'].includes(location?.origin)
   ||!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))
   ||value.version!==1||value.environmentId!=='e662fd94-d797-4b3b-938a-d143ad758b67'||value.database!=='MELISA_ERP_CLEAN_TEST_20261022'
   ||value.erpOrigin!==entry.erpOrigin||value.crmOrigin!==location.origin||!Number.isSafeInteger(value.erpUserId)||value.erpUserId<1
   ||typeof value.erpNormalSessionId!=='string'||!uuid.test(value.erpNormalSessionId)||typeof value.crmUserId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value.crmUserId)
   ||!Number.isSafeInteger(value.chatwootAgentId)||value.chatwootAgentId<1||typeof value.bindingRevision!=='string'||!/^[a-f0-9]{64}$/.test(value.bindingRevision)
   ||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now
   ||!user||user.id!==value.crmUserId||user.chatwootAgentId!==value.chatwootAgentId||user.role!=='personel'
   ||user.testAdmin||user.testPersonnel||user.canAssign===true||user.normalRefreshSession!==true
   ||!Array.isArray(user.permissions)||!user.permissions.includes('crm.view')
   ||user.permissions.some(permission=>!['crm.view','crm.send'].includes(permission)))throw unavailable();
 return Object.freeze(Object.fromEntries(fields.map(key=>[key,value[key]])));
}
const identityKey=value=>JSON.stringify(fields.filter(key=>key!=='expiresAt').map(key=>value[key]));

// Reuses the normal loader, refresh manager, /me and server-owned assignments.
// Only authenticated CRM /auth/me.terminalIdentity is consumed. Its ERP
// confirmation and explicit relation remain server-owned upstream contracts.
export function createTerminalSessionConsumer(createLoader,{api,location,now=Date.now,onCommit,onError,onBusy=()=>{},onInvalidate=()=>{}}){
 let generation=0,running=null,closing=null,closeFailure=null,lastKey='',context=null,failure=null;
 const same=epoch=>epoch===generation;
 const current=(epoch,signal)=>{if(!same(epoch)||signal?.aborted)throw new DOMException('Terminal session cancelled','AbortError');};
 const reset=(notify=true)=>{generation++;context=null;loader.invalidate();if(notify){onBusy(false);onInvalidate();}};
 function closeAfter(pending){
  if(closing)return closing;
  const work=(async()=>{if(pending)await pending.catch(()=>{});await api.clearNormalSession(lastKey);lastKey='';closeFailure=null;})();
  closing=work.then(value=>{closing=null;return value;},error=>{closing=null;closeFailure=error;throw error;});
  closing.catch(()=>{});return closing;
 }
 const close=()=>{if(closing)return closing;const pending=running;reset();return closeAfter(pending);};
 async function verify(key,options={}){
  const epoch=generation;current(epoch,options.signal);
  const user=await api.session(key,{...options,preserveAuthDenial:true,redirect:'error'});current(epoch,options.signal);
  const next=terminalIdentity(user?.terminalIdentity,user,location,now());
  if(context&&identityKey(context)!==identityKey(next))throw unavailable();
  context=next;return user;
 }
 const loader=createLoader({api:{...api,
  resumeNormalSession:async options=>{
   const result=await api.resumeNormalSession(options);
   if(result?.accessToken)lastKey=result.accessToken;
   if(!result)throw unavailable();return result;
  },
  session:verify,
  inbox:async(key,offset,options)=>{
   const epoch=generation,pinned=context,result=await api.inbox(key,offset,options);current(epoch,options.signal);
   await verify(key,options);current(epoch,options.signal);const next=context;
   if(!pinned||identityKey(pinned)!==identityKey(next)||!Array.isArray(result?.conversations)
     ||result.conversations.some(row=>row.assignedUserId!==next.crmUserId||row.chatwootAgentId!==next.chatwootAgentId))throw unavailable();
   context=next;return result;
  },
 },onCommit,onBusy,onError:error=>{failure=error;}});
 async function fail(error,epoch,pending=running){
  if(!same(epoch)||error.name==='AbortError')return;
  if(![401,403].includes(error.status)||(error.status===401&&error.code==='AUTH_TOKEN_EXPIRED')){
   reset();onError(error,{resume:true,preserveNormal:true});return;
  }
  reset();const closed=closeAfter(pending);onError(error,{resume:true});
  try{await closed;}catch(closeError){onError(Object.assign(Error('CRM oturumunun kapanışı doğrulanamadı. Yeniden deneyin.'),{status:403,code:'CRM_TERMINAL_CLOSE_UNCONFIRMED',cause:closeError}),{resume:true});}
 }
 function start(){
  if(closing)return closing.then(()=>start(),error=>{onError(error,{resume:true});return null;});
  if(closeFailure)return close().then(()=>start(),error=>{onError(error,{resume:true});return null;});
  if(running)return running;
  const epoch=++generation;failure=null;
  const work=(async()=>{
   try{
    const result=await loader.start({resume:true,requireResume:true});
    if(!same(epoch))return null;
    if(!result)throw failure||unavailable();return result;
   }catch(error){await fail(error,epoch,null);return null;}
  })();
  running=work.finally(()=>{if(running===tracked)running=null;});const tracked=running;return tracked;
 }
 return {start,close,invalidate:close,cancel:()=>reset(false),refreshAgents:()=>loader.refreshAgents(),isPending:()=>Boolean(running||closing),
  verifySession:async(key,options={})=>{
   // A permission read for the previous access token is not a revoke of the
   // normal family currently being rotated. The replacement does its own /me.
   if(running||key!==lastKey)throw new DOMException('Terminal session replaced','AbortError');
   const epoch=generation;
   try{if(!context||key!==lastKey)throw unavailable();return await verify(key,options);}
   catch(error){if(!(error.status===401&&error.code==='AUTH_TOKEN_EXPIRED'))await fail(error,epoch);throw error;}
  },
 };
}
