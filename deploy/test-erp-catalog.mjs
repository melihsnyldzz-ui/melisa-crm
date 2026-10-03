import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createCrmCatalogReadSource, runExistingStockWorker, normalizeCrmOrigin } from '../packages/erp-adapter/services/crmCatalogReadSource.mjs';
import {loadTestErpReadEnvironment,createTestErpPhotoRead} from './test-erp-read-environment.mjs';
const crmOrigin=normalizeCrmOrigin(process.env.CRM_TEST_GATEWAY_ORIGIN||'http://127.0.0.1:62401',{loopbackOnly:true});
const apiRoot=process.env.CRM_ERP_API_ROOT;
if(!apiRoot)throw Error('CRM_ERP_API_ROOT_REQUIRED');
process.chdir(apiRoot);
await loadTestErpReadEnvironment();
const database=await import(pathToFileURL(apiRoot+'/src/config/database.js'));
const handler=createCrmCatalogReadSource({activationApproved:true,crmOrigin,transport:fetch,getSqlPool:database.getSqlPool,getSqlDriver:database.getSqlDriver,readExistingStock:runExistingStockWorker});
const photoHandler=process.env.CRM_ERP_PHOTO_ROOT?createTestErpPhotoRead({photoRoot:process.env.CRM_ERP_PHOTO_ROOT,crmOrigin,transport:fetch,getSqlPool:database.getSqlPool,getSqlDriver:database.getSqlDriver}):null;
const server=http.createServer(async(req,res)=>{
 try {
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const request=new Request('http://127.0.0.1:62402'+req.url,{headers:req.headers});
  const response=req.url.startsWith('/api/crm-catalog/')?await handler(request):req.url.startsWith('/uploads/vega-products/')?photoHandler?await photoHandler(request):await fetch('http://127.0.0.1:4100'+req.url,{headers:{authorization:req.headers.authorization||''},redirect:'error'}):new Response(null,{status:404});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({success:false,error:{code:'TEST_ERP_CATALOG_UNAVAILABLE'}}));}
}).listen(62402,'127.0.0.1',()=>console.log('TEST ERP katalog adaptörü hazır.'));
server.on('error',error=>{console.error(error.code);process.exit(1);});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
