import crypto from 'node:crypto';
import {normalRefreshUserPolicy} from './normalRefreshSession.mjs';

import {TOKEN,reject,exact,text,terminalIdentityKey,validateTerminalIdentity,validateTerminalLink,validateTerminalRequest} from '../../../../packages/contracts/terminal-handoff.mjs';
const proofObjects=new WeakSet();
export const isTerminalPeerProof=value=>proofObjects.has(value);

/** Fixed loopback TEST peer only; no ERP access/refresh credentials enter CRM. */
export function configuredTerminalHandoffPeer({config=process.env,fetchFn=(...args)=>fetch(...args),now=Date.now}={}){
 if(config.CRM_TERMINAL_HANDOFF_ENABLED!=='true')return null;
 const authorize=normalRefreshUserPolicy(config),key=config.CRM_TERMINAL_PEER_KEY;
 if(config.CRM_TEST_PROFILE!=='clean-synthetic-20261022'||!text(key,TOKEN)||Buffer.from(key,'base64url').length!==32
  ||Buffer.from(key,'base64url').toString('base64url')!==key||key===config.WHATSAPP_CRM_AUTH_JWT_SECRET)throw reject(503);
 const snapshot=crypto.createHash('sha256').update(key).digest('hex');
 const enabled=()=>{
  try{return Boolean(config.CRM_TERMINAL_HANDOFF_ENABLED==='true'&&config.CRM_TERMINAL_PEER_KEY===key
   &&crypto.createHash('sha256').update(config.CRM_TERMINAL_PEER_KEY).digest('hex')===snapshot
   &&normalRefreshUserPolicy(config)&&authorize);}catch{return false;}
 };
 async function call(action,body){
  if(!enabled())throw reject();
  let response;
  try{
   response=await fetchFn(`http://127.0.0.1:4194/api/auth/terminal-handoff/${action}`,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{'content-type':'application/json','x-melisa-terminal-peer':key},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
   if(![200,201].includes(response.status))throw reject([400,401,403,404,409,410,422].includes(response.status)?403:503);
   if(Number(response.headers.get('content-length')||0)>16384)throw reject(503);
   const reader=response.body?.getReader();if(!reader)throw reject(503);
   const chunks=[];let bytes=0;
   try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16384)throw reject(503);chunks.push(part.value);}}
   catch(error){await reader.cancel().catch(()=>{});throw error;}
   const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(payload?.success!==true||!payload.data||typeof payload.data!=='object')throw reject(503);
   return payload.data;
  }catch(error){if(error?.code?.startsWith('CRM_TERMINAL_'))throw error;throw reject(503);}
  finally{if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});}
 }
 function proof(link){validateTerminalLink(link,{now:now(),fresh:true});const value=Object.freeze({...link,terminalIdentity:Object.freeze({...link.terminalIdentity})});proofObjects.add(value);return value;}
 const context=link=>Object.fromEntries(['linkId','requestId','deviceBinding','erpOrigin','crmOrigin'].map(field=>[field,link[field]]));
 return Object.freeze({
  enabled,
  async redeem(input){
   validateTerminalRequest(input);const reply=await call('redeem',input);
   if(!exact(reply,['version','linkId','linkExpiresAt','terminalIdentity'])||reply.version!==1)throw reject();
   return proof({...context({...input,linkId:reply.linkId}),linkExpiresAt:reply.linkExpiresAt,terminalIdentity:reply.terminalIdentity});
  },
  async verify(link){
   validateTerminalLink(link);const reply=await call('verify',context(link));
   if(!exact(reply,['version','linkExpiresAt','terminalIdentity'])||reply.version!==1||reply.linkExpiresAt!==link.linkExpiresAt)throw reject();
   validateTerminalIdentity(reply.terminalIdentity,{now:now()});
   if(terminalIdentityKey(reply.terminalIdentity)!==terminalIdentityKey(link.terminalIdentity))throw reject();
   return proof({...link,terminalIdentity:reply.terminalIdentity});
  },
  async revoke(link){validateTerminalLink(link);const reply=await call('revoke',context(link));if(!exact(reply,['revoked'])||reply.revoked!==true)throw reject();return {revoked:true};},
 });
}
