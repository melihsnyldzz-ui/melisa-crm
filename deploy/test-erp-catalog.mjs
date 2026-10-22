import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createCanonicalCatalogReader} from '../packages/erp-adapter/services/canonicalCatalogReader.mjs';
import {resolveTestEndpoints} from './test-endpoints.mjs';
const endpoints=resolveTestEndpoints();
let token='',expiresAt=0,tokenScope='';
export async function getErpAuthorization({refresh=false,fetchFn=fetch,readFileFn=readFile,environment=process.env,testEndpoints=endpoints}={}){
 const clean=environment.CRM_TEST_PROFILE==='clean-synthetic-20261022';
 if(Boolean(testEndpoints.cleanSynthetic)!==clean)throw Error('ERP_AUTH_REQUIRED');
 const access=clean?environment.CRM_CLEAN_ERP_CATALOG_ACCESS_JSON:environment.CRM_ERP_CATALOG_ACCESS_PATH;
 if(typeof access!=='string'||!access||clean&&access.length>16384||!clean&&!path.isAbsolute(access))throw Error('ERP_AUTH_REQUIRED');
 const scope=testEndpoints.erpOrigin+':'+(clean?createHash('sha256').update(access).digest('hex'):access);
 if(!refresh&&token&&tokenScope===scope&&expiresAt>Date.now()+60000)return `Bearer ${token}`;
 let privateAccess;try{privateAccess=JSON.parse(clean?access:await readFileFn(access,'utf8'));}catch{throw Error('ERP_AUTH_REQUIRED');}
 const account=privateAccess?.ilker;
 if(typeof account?.username!=='string'||typeof account?.password!=='string')throw Error('ERP_AUTH_REQUIRED');
 const response=await fetchFn(testEndpoints.erpOrigin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',...(testEndpoints.isolated?{origin:testEndpoints.erpUiOrigin}:{})},body:JSON.stringify({username:account.username,password:account.password}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const payload=await response.json(),data=payload.data??payload;
 if(!response.ok||typeof data.accessToken!=='string'||!data.user?.permissions?.includes('product.view')||!data.user.permissions.includes('sales.view'))throw Error('ERP_AUTH_REQUIRED');
 token=data.accessToken;tokenScope=scope;expiresAt=Date.now()+300000;return `Bearer ${token}`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
const reader=createCanonicalCatalogReader({crmOrigin:endpoints.gatewayOrigin,erpOrigin:endpoints.erpOrigin,expectedDatabase:endpoints.database,getErpAuthorization});
const server=http.createServer(async(req,res)=>{
 const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort()};req.once('aborted',cancel);res.once('close',cancel);
 try{const result=await reader(new Request(endpoints.catalogOrigin+req.url,{method:req.method,headers:req.headers,signal:controller.signal}));const body=Buffer.from(await result.arrayBuffer());if(controller.signal.aborted)return;res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);}catch{if(!res.destroyed){res.writeHead(503);res.end();}}finally{req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
}).listen(endpoints.catalog,'127.0.0.1');
server.on('error',()=>process.exit(1));process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
}
