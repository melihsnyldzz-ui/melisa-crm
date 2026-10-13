import path from 'node:path';
import {createNormalRefreshStore,DEDICATED_NORMAL_TEST_USER_ID,DEDICATED_SEMIH_TEST_USER_ID} from './normalRefreshSession.mjs';

const DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_02';
const fail=()=>{throw Object.assign(Error('CUSTOMER_REQUEST_SHARED_TEST_REQUIRED'),{code:'CUSTOMER_REQUEST_SHARED_TEST_REQUIRED',statusCode:503});};
const privateFile=value=>{
  if(typeof value!=='string'||!path.isAbsolute(value))return false;
  const relative=path.relative(path.resolve('C:/Sirket/CRM/runtime'),path.resolve(value));
  return Boolean(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
};
const sameFile=(left,right)=>Boolean(left&&right&&path.resolve(left).toLowerCase()===path.resolve(right).toLowerCase());

/** Owner-selected existing normal users; this never adds a profile or permission. */
export function customerRequestSharedConfig(environment=process.env){
  if(environment.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED!=='true')return null;
  if(environment.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF==='true'||environment.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'
    ||environment.CRM_UI_ORIGIN!=='http://127.0.0.1:62700'||environment.CRM_TEST_PORT_BASE!=='62700'
    ||environment.CRM_ISOLATED_PREPARATION!=='true'||environment.CRM_TEST_EXPECTED_DATABASE!==DATABASE
    ||environment.CRM_TEST_ERP_ORIGIN!=='http://127.0.0.1:4184'||environment.WHATSAPP_SEND_ENABLED!=='false'
    ||environment.WHATSAPP_LIVE_SEND_APPROVED!=='false'||environment.CRM_PAID_AI_ENABLED!=='false'
    ||!['','192.168.1.46'].includes(environment.CRM_TEST_LAN_ADDRESS||''))fail();
  let issuerIds;
  try{issuerIds=JSON.parse(environment.CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS);}catch{fail();}
  if(!Array.isArray(issuerIds)||!issuerIds.length||issuerIds.length>8||new Set(issuerIds).size!==issuerIds.length
    ||issuerIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id)
      ||[DEDICATED_NORMAL_TEST_USER_ID,DEDICATED_SEMIH_TEST_USER_ID].includes(id)))fail();
  const storeFile=environment.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE;
  const refreshJournalFile=environment.CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH;
  if(!privateFile(storeFile)||!privateFile(refreshJournalFile)||sameFile(storeFile,refreshJournalFile)
    ||[environment.CRM_NORMAL_REFRESH_JOURNAL_PATH,environment.CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH].some(file=>sameFile(file,storeFile)||sameFile(file,refreshJournalFile)))fail();
  return {enabled:true,mode:'shared',isolatedPreparation:true,database:DATABASE,catalogScope:'existing-photo-catalog-v1',sessionTtlMs:3600000,
    uiOrigin:'http://127.0.0.1:62700',gatewayOrigin:'http://127.0.0.1:62701',
    allowedOrigins:['http://127.0.0.1:62700',...(environment.CRM_TEST_LAN_ADDRESS?['http://192.168.1.46:62700']:[])],
    issuerIds,storeFile,refreshJournalFile};
}

export function configuredCustomerRequestIssuerStore({config=process.env,resolveUser}={}){
  const reviewed=customerRequestSharedConfig(config);
  if(!reviewed)return null;
  if(typeof resolveUser!=='function')fail();
  const snapshot=JSON.stringify(reviewed);
  const allows=user=>{
    try{return JSON.stringify(customerRequestSharedConfig(config))===snapshot&&reviewed.issuerIds.includes(user?.id)
      &&user.active===true&&!user.testAdmin&&!user.testPersonnel&&['patron','mudur'].includes(user.role)
      &&Number.isSafeInteger(user.chatwootAgentId)&&user.chatwootAgentId>0
      &&Array.isArray(user.permissions)&&user.permissions.includes('crm.view')&&user.permissions.includes('crm.manage');}
    catch{return false;}
  };
  // An unknown/personnel/anonymous ID is a startup error, never an implicit role upgrade.
  if(reviewed.issuerIds.some(id=>!allows(resolveUser(id))))fail();
  return {store:createNormalRefreshStore({file:reviewed.refreshJournalFile,resolveUser,authorizeUser:allows}),
    includes:id=>reviewed.issuerIds.includes(id),allows};
}
