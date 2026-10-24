import fs from 'node:fs';
import path from 'node:path';
import {resolveTestEndpoints,sharedTestHealthSafe} from '../../../../deploy/test-endpoints.mjs';
import {assertTestExecutionPackage} from '../../../../deploy/test-supervisor.mjs';
const DATABASE='MELISA_ERP_CRM_SHARED_TEST_20261009_02';
const CONTEXT_PATH='C:/Sirket/ERP/config/ERP-CRM-SHARED-TEST-20261009-02/crm-order-private.json';
const POLICY=Object.freeze({scope:'crm-read',max:6000,windowMs:900000,environment:'ISOLATED_TEST_COPY',database:DATABASE});
let registered=null;
const check=ok=>{if(!ok)throw Error('BUSINESS_TEST_READ_BUDGET_REJECTED');};
const hex=(v,n=64)=>typeof v==='string'&&new RegExp(`^[a-f0-9]{${n}}$`,'i').test(v);
export function getBusinessTestReadBudget(){return registered;}
export async function installBusinessTestReadBudget({executionRoot,environment=process.env,fetchImpl=globalThis.fetch,verifyPackage=assertTestExecutionPackage,readFile=filename=>fs.readFileSync(filename,'utf8')}={}){
 const endpoints=resolveTestEndpoints(environment);if(!endpoints.businessScope)return null;
 check(!registered&&endpoints.isolated&&endpoints.database===DATABASE&&endpoints.ui===62700&&endpoints.gateway===62701&&endpoints.native===62704&&endpoints.erpPort===4184&&endpoints.erpUiOrigin==='http://127.0.0.1:5234'
  &&environment.CRM_ISOLATED_PREPARATION==='true'&&environment.CRM_PAID_AI_ENABLED==='false'&&environment.CRM_AI_SALES_MODE==='off'&&environment.WHATSAPP_SEND_ENABLED==='false'&&environment.WHATSAPP_LIVE_SEND_APPROVED==='false');
 const verified=verifyPackage(executionRoot,environment),manifest=JSON.parse(readFile(path.join(executionRoot,'release-manifest.json')));
 check(verified?.environment==='TEST'&&manifest.build?.isolatedPreparation===true&&hex(environment.CRM_TEST_SOURCE_COMMIT,40)&&verified.sourceCommit===environment.CRM_TEST_SOURCE_COMMIT&&manifest.source?.commit===verified.sourceCommit);
 const c=JSON.parse(readFile(CONTEXT_PATH)).crmOrderCurrentContext;
 check(c?.target?.database===DATABASE&&c.target.server==='Semih\\MELISADEV'&&c.target.login==='melisa_crm_shared_draft_20261009_02'&&c.target.databaseUser===c.target.login&&c.nativePort===62704&&c.apiPort===4184&&c.crmOrigin===endpoints.gatewayOrigin&&c.actualT1===false&&c.externalOperations===false&&c.stockEffect===false&&c.ledgerEffect===false&&c.reservationEffect===false&&hex(c.backupSHA)&&typeof c.copyId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.copyId));
 const s=c.catalog;check(s?.schemaVersion==='melisa-product-completion-catalog-context.v1'&&s.actualT1===false&&s.evidenceKind==='DATED_TEST_PRODUCT_SCOPE'&&/^PRODUCT-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s.runId)&&/^\d{4}-\d{2}-\d{2}$/.test(s.sourceAsOf)&&['sourceHash','planHash','bindingsHash','snapshotHash'].every(k=>hex(s[k]))&&Number.isSafeInteger(s.productCount)&&s.productCount>0&&Number.isSafeInteger(s.priceCount)&&s.priceCount>0);
 const expectedSource={runId:s.runId,sourceAsOf:s.sourceAsOf,sourceHash:s.sourceHash,planHash:s.planHash,bindingsHash:s.bindingsHash,snapshotHash:s.snapshotHash,counts:{products:s.productCount,prices:s.priceCount},actualT1:false};
 const health=async origin=>{const response=await fetchImpl(origin+'/test-health',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});check(response.ok);return response.json();};
 const [erp,native]=await Promise.all([health(endpoints.erpOrigin),health(endpoints.nativeOrigin)]);
 check(sharedTestHealthSafe(erp)&&erp.ok===true&&erp.databaseName===DATABASE&&erp.port===4184&&erp.mode==='erp'&&erp.copyId===c.copyId&&erp.backupSHA===c.backupSHA&&hex(erp.sourceCommit,40)&&typeof erp.packageId==='string'&&erp.packageId.length>0);
 check(sharedTestHealthSafe(native)&&native.ok===true&&native.databaseName===DATABASE&&native.database===DATABASE&&native.port===62704&&native.purpose==='crm-order-draft-only'&&native.copyId===c.copyId&&native.sourceCommit===environment.CRM_TEST_NATIVE_SOURCE_COMMIT&&hex(native.sourceCommit,40)&&native.packageId===environment.CRM_TEST_NATIVE_PACKAGE_ID&&typeof native.packageId==='string'&&native.packageId.length>0&&native.stockEffect===false&&native.ledgerEffect===false&&native.reservationEffect===false&&JSON.stringify(native.currentSource)===JSON.stringify(expectedSource));
 registered=POLICY;return registered;
}
