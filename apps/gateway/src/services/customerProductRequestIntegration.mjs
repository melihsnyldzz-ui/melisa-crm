import path from 'node:path';
import {createCustomerProductRequestService} from './customerProductRequest.mjs';
import {createCustomerProductRequestRouter} from '../routes/customerProductRequestRoutes.mjs';
import {captureNormalCrmAuthority,verifyNormalCrmAuthority,verifyCrmAccessToken,semihTestContinueEnabled,customerRequestIssuerSessionsEnabled} from './crmAuthService.js';
import {customerRequestSharedConfig} from './customerRequestIssuerSession.mjs';
import {getChatwootProductRequestBinding} from './chatwootInboxService.js';

const DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_02';
const fail=(code,statusCode=503)=>{throw Object.assign(new Error(code),{code,statusCode});};
const equal=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
export function customerRequestProofConfig(environment=process.env){
  if(environment.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF!=='true')return null;
  if(environment.CRM_UI_ORIGIN!=='http://127.0.0.1:62800'||environment.CRM_ISOLATED_PREPARATION!=='true'
    ||environment.CRM_TEST_EXPECTED_DATABASE!==DATABASE||environment.CRM_TEST_ERP_ORIGIN!=='http://127.0.0.1:4184'
    ||environment.WHATSAPP_SEND_ENABLED!=='false'||environment.WHATSAPP_LIVE_SEND_APPROVED!=='false'
    ||environment.CRM_PAID_AI_ENABLED!=='false'||!path.isAbsolute(environment.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE||''))fail('CUSTOMER_REQUEST_PROOF_REQUIRED');
  return {enabled:true,mode:'proof',uiOrigin:'http://127.0.0.1:62800',gatewayOrigin:'http://127.0.0.1:62801',allowedOrigins:['http://127.0.0.1:62800'],isolatedPreparation:true,database:DATABASE,catalogScope:'existing-photo-catalog-v1',sessionTtlMs:3600000};
}
export function customerRequestRuntimeConfig(environment=process.env){
  const shared=customerRequestSharedConfig(environment);
  return shared||customerRequestProofConfig(environment);
}

/** Independent customer capabilities and CRM-only interest records; ERP remains read-only. */
export function createCustomerProductRequestIntegration({Router,environment=process.env,crmOrigin='http://127.0.0.1:62801',catalogReader,getCrmAuthorization}={}){
  const config=customerRequestRuntimeConfig(environment);
  if(!config)return {router:null,service:null,enabled:false};
  if(crmOrigin!==config.gatewayOrigin||typeof catalogReader!=='function'
    ||(config.mode==='proof'? !semihTestContinueEnabled()||typeof getCrmAuthorization!=='function':!customerRequestIssuerSessionsEnabled()||getCrmAuthorization!==undefined))fail('CUSTOMER_REQUEST_PROOF_REQUIRED');
  // Only official, freshly verified issuer JWTs are retained in RAM. They are
  // never persisted with customer capabilities and cannot be reconstructed on restart.
  const readers=new Map();
  const authorityKey=authority=>JSON.stringify([authority.id,authority.normalSessionId,authority.fingerprint,authority.expiresAt]);
  const catalog=async(tail='',query={},_binding,authority)=>{
    let authorization;
    if(config.mode==='proof')authorization=await getCrmAuthorization();
    else{
      verifyNormalCrmAuthority(authority);
      const record=readers.get(authorityKey(authority));
      if(!record||!equal(captureNormalCrmAuthority(record.token).authority,authority))fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE');
      // The core checks the actual customer/assignment tuple before and after
      // each operation. Do not repeat that network read for every selected product.
      authorization='Bearer '+record.token;
    }
    if(!/^Bearer [^\s]+$/.test(authorization||''))fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE');
    const url=new URL('/api/crm-catalog/products'+tail,crmOrigin);
    for(const [key,value]of Object.entries(query))if(value!==null&&value!==undefined&&value!=='')url.searchParams.set(key,String(value));
    const response=await catalogReader(new Request(url,{headers:{authorization},signal:AbortSignal.timeout(15000)}));
    if(!response.ok)fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE');
    return response;
  };
  const normalize=row=>{
    if(row?.isActive!==true||row.status!=='active'||row.hold?.blocked!==false||row.photo?.verified!==true
      ||row.photo?.validationStatus!=='CONFIRMED'||row.photoStatus!=='guarded-path'||row.photoPath!==`/crm/catalog/products/${row.id}/photo`)fail('CUSTOMER_REQUEST_PRODUCT_UNAVAILABLE');
    return {...row,active:true};
  };
  const resolveBinding=(user,conversationId)=>getChatwootProductRequestBinding({user,conversationId});
  const service=createCustomerProductRequestService({config,storeFile:environment.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE,resolveBinding,
    validateBinding:async(binding,authority)=>{
      try{return equal(binding,await resolveBinding(verifyNormalCrmAuthority(authority),binding.chatwootConversationId));}catch{return false;}
    },
    readCatalogPage:async(query,binding,authority)=>{
      if(query.age!==null)fail('CUSTOMER_REQUEST_QUERY_INVALID',400);
      const payload=await(await catalog('',{search:query.search,category:query.category,page:query.page,limit:query.limit,hasImage:true},binding,authority)).json();
      if(payload?.success!==true||!Array.isArray(payload.data))fail('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE');
      return {...payload,data:payload.data.map(normalize)};
    },
    readProduct:async(id,binding,authority)=>{
      const payload=await(await catalog('/'+id,{},binding,authority)).json();
      return {...payload,data:normalize(payload.data)};
    },
    readPhoto:async(id,binding,authority)=>{
      const response=await catalog('/'+id+'/photo',{variant:'original'},binding,authority);
      // Never buffer an unbounded upstream file, even when its header is missing.
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>3*1024*1024)fail('CUSTOMER_REQUEST_PHOTO_UNAVAILABLE');chunks.push(part.value);}}
      finally{if(size>3*1024*1024)await reader.cancel().catch(()=>{});reader.releaseLock();}
      return {bytes:new Uint8Array(Buffer.concat(chunks)),mime:(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()};
    },
  });
  const verifyStaff=req=>{
    const header=req.get('authorization')||'';
    if(!/^Bearer [^\s]+$/.test(header))fail('WHATSAPP_CRM_AUTH_REQUIRED',401);
    const token=header.slice(7),user=verifyCrmAccessToken(token);
    if(req.method==='POST'&&req.path==='/crm/customer-product-requests/sessions'){
      const {authority}=captureNormalCrmAuthority(token);
      if(config.mode==='shared'){
        if(!config.issuerIds.includes(user.id)||!['patron','mudur'].includes(user.role)||!user.permissions?.includes('crm.manage'))fail('CUSTOMER_REQUEST_FORBIDDEN',403);
        for(const [key,record]of readers)if(record.expiresAt<=Date.now())readers.delete(key);
        const key=authorityKey(authority);
        if(!readers.has(key)&&readers.size>=512)fail('CUSTOMER_REQUEST_SESSION_LIMIT');
        readers.set(key,{token,expiresAt:authority.expiresAt});
      }
      return {...user,...authority};
    }
    return user;
  };
  return {enabled:true,service,router:createCustomerProductRequestRouter({Router,service,verifyStaff,allowedOrigins:config.allowedOrigins})};
}
