import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCanonicalCatalogReader} from '../packages/erp-adapter/services/canonicalCatalogReader.mjs';
import {resolveTestEndpoints} from './test-endpoints.mjs';
const endpoints=resolveTestEndpoints();
const authorizations=new Map();
export async function getErpAuthorization({refresh=false,accountName='ilker',fetchFn=fetch,readFileFn=readFile,environment=process.env,testEndpoints=endpoints}={}){
 if(!['ilker','seller'].includes(accountName)||accountName==='seller'&&!testEndpoints.isolated)throw Error('ERP_AUTH_REQUIRED');
 if(!environment.CRM_ERP_CATALOG_ACCESS_PATH)throw Error('ERP_AUTH_REQUIRED');
 if(!path.isAbsolute(environment.CRM_ERP_CATALOG_ACCESS_PATH))throw Error('ERP_AUTH_REQUIRED');
 const cacheKey=JSON.stringify([accountName,testEndpoints.erpOrigin,environment.CRM_ERP_CATALOG_ACCESS_PATH]);
 const cached=authorizations.get(cacheKey);
 if(!refresh&&cached&&cached.expiresAt>Date.now()+60000)return `Bearer ${cached.token}`;
 const privateAccess=JSON.parse(await readFileFn(environment.CRM_ERP_CATALOG_ACCESS_PATH,'utf8'));
 const account=privateAccess[accountName];
 if(typeof account?.username!=='string'||typeof account?.password!=='string')throw Error('ERP_AUTH_REQUIRED');
 const response=await fetchFn(testEndpoints.erpOrigin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',...(testEndpoints.isolated?{origin:'http://127.0.0.1:5224'}:{})},body:JSON.stringify({username:account.username,password:account.password}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const payload=await response.json(),data=payload.data??payload;
 if(!response.ok||typeof data.accessToken!=='string'||!data.user?.permissions?.includes('product.view')||!data.user.permissions.includes('sales.view')||accountName==='seller'&&!data.user.permissions.includes('sales.create'))throw Error('ERP_AUTH_REQUIRED');
 authorizations.set(cacheKey,{token:data.accessToken,expiresAt:Date.now()+300000});return `Bearer ${data.accessToken}`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
const reader=createCanonicalCatalogReader({crmOrigin:endpoints.gatewayOrigin,erpOrigin:endpoints.erpOrigin,expectedDatabase:endpoints.database,getErpAuthorization});
const server=http.createServer(async(req,res)=>{
 const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort()};req.once('aborted',cancel);res.once('close',cancel);
 try{const result=await reader(new Request(endpoints.catalogOrigin+req.url,{method:req.method,headers:req.headers,signal:controller.signal}));const body=Buffer.from(await result.arrayBuffer());if(controller.signal.aborted)return;res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);}catch{if(!res.destroyed){res.writeHead(503);res.end();}}finally{req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
}).listen(endpoints.catalog,'127.0.0.1');
server.on('error',()=>process.exit(1));process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
}
