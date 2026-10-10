import fs from 'node:fs';
import path from 'node:path';
import {assertTestExecutionPackage} from './test-supervisor.mjs';
export const SHARED_STABLE_ORIGIN = 'https://semih.tail295701.ts.net:8443';
export const SHARED_CRM_PREFIX = '/crm/';
export const SHARED_DB02_COPY_ID = 'e16b70f0-4057-428b-9abc-6bbcaf35fe82';
export function resolveStableTransport(env, endpoints) {
  const flag = env.CRM_STABLE_TRANSPORT ?? 'false';
  if (!['true', 'false'].includes(flag)) throw Error('CRM_STABLE_TRANSPORT_INVALID');
  if (flag === 'true' && (!endpoints.businessScope || !endpoints.isolated
    || endpoints.database !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_02')) throw Error('CRM_STABLE_DB02_REQUIRED');
  return flag === 'true';
}
export function stableCrmRequestAllowed(req, enabled, endpoints) {
  return enabled && endpoints.businessScope && endpoints.isolated
    && endpoints.database === 'MELISA_ERP_CRM_SHARED_TEST_20261009_02'
    && req.socket?.localAddress === '127.0.0.1' && req.socket?.remoteAddress === '127.0.0.1'
    && req.headers.host === `127.0.0.1:${endpoints.ui}` && req.url?.startsWith(SHARED_CRM_PREFIX)
    && !['forwarded', 'x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'].some(key => req.headers[key])
    && (!req.headers.origin ? ['GET', 'HEAD'].includes(req.method) : req.headers.origin === SHARED_STABLE_ORIGIN)
    && (!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']));
}
export function crmUpstreamRoute(url, endpoints) {
  if (!url.startsWith('/api/live/')) return null;
  return { port: url.startsWith('/api/live/crm/erp/') ? endpoints.orders : endpoints.gateway,
    path: url.slice('/api/live'.length) };
}
// This is configured process identity. Database/dependency readiness is proved
// separately by the existing ERP/native probes, never inferred from this DTO.
export function createStableServiceHealthHandler({service,executionRoot,environment=process.env,testEndpoints,
  verifyPackage=assertTestExecutionPackage,readManifest=filename=>JSON.parse(fs.readFileSync(filename,'utf8'))}={}) {
  if(!resolveStableTransport(environment,testEndpoints))return()=>false;
  const sourceCommit=environment.CRM_TEST_SOURCE_COMMIT,copyId=environment.CRM_TEST_COPY_ID;
  if(!['catalog','orders','gateway'].includes(service)||typeof executionRoot!=='string'
    ||! /^[a-f0-9]{40}$/.test(sourceCommit||'')
    ||copyId!==SHARED_DB02_COPY_ID
    ||environment.CRM_PAID_AI_ENABLED!=='false'||environment.WHATSAPP_SEND_ENABLED!=='false')throw Error('CRM_STABLE_HEALTH_IDENTITY_REQUIRED');
  const verified=verifyPackage(executionRoot,environment),manifest=readManifest(path.join(executionRoot,'release-manifest.json'));
  const packageId=path.basename(path.resolve(executionRoot));
  if(verified?.environment!=='TEST'||verified.sourceCommit!==sourceCommit
    ||manifest?.source?.commit!==sourceCommit||manifest.build?.stableTransport!==true||manifest.build.isolatedPreparation!==true
    ||packageId!==`crm-shared-stable-test-${sourceCommit}`)throw Error('CRM_STABLE_HEALTH_IDENTITY_REQUIRED');
  const body=JSON.stringify({ok:true,service,sourceCommit,packageId,database:testEndpoints.database,databaseName:testEndpoints.database,copyId,
    port:testEndpoints[service],identityKind:'CONFIGURED_TEST_TRANSPORT',dependencyProof:'SEPARATE_ERP_NATIVE_PROBES',
    actualT1:false,externalOperations:false,paidAi:false,whatsappSend:false});
  return(req,res)=>{
    if(req.url!=='/test-health')return false;
    const denied=!['GET','HEAD'].includes(req.method)||req.socket?.localAddress!=='127.0.0.1'||req.socket?.remoteAddress!=='127.0.0.1'
      ||req.headers.host!==`127.0.0.1:${testEndpoints[service]}`
      ||['origin','forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto','x-real-ip'].some(key=>Object.hasOwn(req.headers,key));
    res.writeHead(denied?403:200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:denied?'{"error":"CRM_STABLE_HEALTH_LOOPBACK_REQUIRED"}':body);
    return true;
  };
}
