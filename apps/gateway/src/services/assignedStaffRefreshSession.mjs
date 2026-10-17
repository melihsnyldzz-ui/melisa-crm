import path from 'node:path';
import {createNormalRefreshStore,assertPrivateRefreshJournal,DEDICATED_NORMAL_TEST_USER_ID} from './normalRefreshSession.mjs';

export const DEDICATED_ASSIGNED_STAFF_TEST_USER_ID='crm-crm06-staff-test-20261014';
export const ASSIGNED_STAFF_REFRESH_JOURNAL='C:/Sirket/CRM/runtime/CRM06-TEST-ACTORS-20261014/assigned-staff-refresh.json';
const scopeKeys=['CRM_ASSIGNED_STAFF_REFRESH_ENABLED','CRM_ASSIGNED_STAFF_REFRESH_USER_ID','CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH',
  'CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED','CRM_CUSTOMER_PRODUCT_REQUEST_PROOF','CRM_SEMIH_TEST_CONTINUE_ENABLED',
  'CRM_ISOLATED_PREPARATION','CRM_TEST_EXPECTED_DATABASE','CRM_UI_ORIGIN','CRM_TEST_PORT_BASE','CRM_TEST_ERP_ORIGIN',
  'WHATSAPP_SEND_ENABLED','WHATSAPP_LIVE_SEND_APPROVED','CRM_PAID_AI_ENABLED',
  'CRM_NORMAL_REFRESH_ENABLED','CRM_NORMAL_REFRESH_USER_ID','CRM_NORMAL_REFRESH_JOURNAL_PATH','CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH',
  'CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE','CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH'];
const invalid=()=>{throw Error('Assigned TEST staff refresh configuration is invalid.');};
const sameFile=(left,right)=>Boolean(left&&right&&path.resolve(left).toLowerCase()===path.resolve(right).toLowerCase());
// Win32 strips trailing dots/spaces; lexical comparison alone would let two
// apparently different configured paths address the same journal. Reject ADS too.
export const isStableWindowsJournalPath=value=>typeof value==='string'&&Boolean(value)
  &&!value.replaceAll('\\','/').split('/').slice(1).some(segment=>/[. ]$/.test(segment)||segment.includes(':'));

export function isDedicatedAssignedStaffTestUser(user){
  return user?.id===DEDICATED_ASSIGNED_STAFF_TEST_USER_ID&&user.username==='crm-crm06-staff'
    &&user.role==='personel'&&user.active===true&&user.chatwootAgentId===2
    &&Array.isArray(user.permissions)&&user.permissions.length===1&&user.permissions[0]==='crm.view'
    &&!user.testAdmin&&!user.testPersonnel;
}

function scopeFingerprint(config){
  const journals=[config.CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH,config.CRM_NORMAL_REFRESH_JOURNAL_PATH,
    config.CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH,config.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE,
    config.CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH];
  if(journals.some(file=>file&&!isStableWindowsJournalPath(file)))invalid();
  if(config.CRM_ASSIGNED_STAFF_REFRESH_ENABLED!=='true'||config.CRM_ASSIGNED_STAFF_REFRESH_USER_ID!==DEDICATED_ASSIGNED_STAFF_TEST_USER_ID
    ||config.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED!=='true'||config.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF==='true'
    ||config.CRM_SEMIH_TEST_CONTINUE_ENABLED==='true'||config.CRM_ISOLATED_PREPARATION!=='true'
    ||config.CRM_TEST_EXPECTED_DATABASE!=='MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    ||config.CRM_UI_ORIGIN!=='http://127.0.0.1:62700'||config.CRM_TEST_PORT_BASE!=='62700'||config.CRM_TEST_ERP_ORIGIN!=='http://127.0.0.1:4184'
    ||config.WHATSAPP_SEND_ENABLED!=='false'||config.WHATSAPP_LIVE_SEND_APPROVED!=='false'||config.CRM_PAID_AI_ENABLED!=='false'
    ||config.CRM_NORMAL_REFRESH_ENABLED!=='true'||config.CRM_NORMAL_REFRESH_USER_ID!==DEDICATED_NORMAL_TEST_USER_ID||!config.CRM_NORMAL_REFRESH_JOURNAL_PATH
    ||!sameFile(config.CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH,ASSIGNED_STAFF_REFRESH_JOURNAL)
    ||[config.CRM_NORMAL_REFRESH_JOURNAL_PATH,config.CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH,
      config.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE,config.CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH]
      .some(file=>sameFile(file,config.CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH)))invalid();
  return JSON.stringify(scopeKeys.map(key=>config[key]??null));
}

// Existing role/assignment/password facts are checked on every operation, not cached.
export function assignedStaffRefreshUserPolicy(config=process.env){
  const snapshot=scopeFingerprint(config);
  return user=>{try{return scopeFingerprint(config)===snapshot&&isDedicatedAssignedStaffTestUser(user);}catch{return false;}};
}

export function configuredAssignedStaffRefreshStore({config=process.env,resolveUser,repoRoot=process.cwd()}={}){
  if(config.CRM_ASSIGNED_STAFF_REFRESH_ENABLED!=='true')return null;
  const authorizeUser=assignedStaffRefreshUserPolicy(config);
  assertPrivateRefreshJournal(config.CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH,config,repoRoot);
  assertPrivateRefreshJournal(config.CRM_NORMAL_REFRESH_JOURNAL_PATH,config,repoRoot);
  if(typeof resolveUser!=='function'||!authorizeUser(resolveUser(DEDICATED_ASSIGNED_STAFF_TEST_USER_ID)))invalid();
  return createNormalRefreshStore({file:config.CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH,resolveUser,authorizeUser});
}
