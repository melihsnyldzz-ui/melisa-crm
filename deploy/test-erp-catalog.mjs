import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createCrmCatalogReadSource, normalizeCrmOrigin } from '../packages/erp-adapter/services/crmCatalogReadSource.mjs';
import {loadTestErpReadEnvironment,createTestErpPhotoRead} from './test-erp-read-environment.mjs';
import {createCrmStockWorkerPool} from '../packages/erp-adapter/services/crmStockWorkerPool.mjs';
const crmOrigin=normalizeCrmOrigin(process.env.CRM_TEST_GATEWAY_ORIGIN||'http://127.0.0.1:62401',{loopbackOnly:true});
const apiRoot=process.env.CRM_ERP_API_ROOT;
if(!apiRoot)throw Error('CRM_ERP_API_ROOT_REQUIRED');
process.chdir(apiRoot);
await loadTestErpReadEnvironment();
const database=await import(pathToFileURL(apiRoot+'/src/config/database.js'));
const stockReaders=createCrmStockWorkerPool();
const handler=createCrmCatalogReadSource({activationApproved:true,crmOrigin,transport:fetch,getSqlPool:database.getSqlPool,getSqlDriver:database.getSqlDriver,readExistingStock:stockReaders.read});
const photoHandler=process.env.CRM_ERP_PHOTO_ROOT?createTestErpPhotoRead({photoRoot:process.env.CRM_ERP_PHOTO_ROOT,crmOrigin,transport:fetch,getSqlPool:database.getSqlPool,getSqlDriver:database.getSqlDriver}):null;
const server=http.createServer(async(req,res)=>{
 const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort()};
 try {
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  req.once('aborted',cancel);res.once('close',cancel);
  const request=new Request('http://127.0.0.1:62402'+req.url,{headers:req.headers,signal:controller.signal});
  const response=req.url.startsWith('/api/crm-catalog/')?await handler(request):req.url.startsWith('/uploads/vega-products/')?photoHandler?await photoHandler(request):await fetch('http://127.0.0.1:4100'+req.url,{headers:{authorization:req.headers.authorization||''},redirect:'error'}):new Response(null,{status:404});
  const body=Buffer.from(await response.arrayBuffer());if(controller.signal.aborted)return;
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
 }catch{if(controller.signal.aborted||res.destroyed)return;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({success:false,error:{code:'TEST_ERP_CATALOG_UNAVAILABLE'}}));}
 finally{req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
}).listen(62402,'127.0.0.1',()=>console.log('TEST ERP katalog adaptörü hazır.'));
server.on('error',error=>{console.error(error.code);process.exit(1);});
process.once('SIGTERM',async()=>{
 const watchdog=setTimeout(()=>process.exit(1),2000);
 let confirmed=false;try{confirmed=await stockReaders.close();}catch{}
 server.close(()=>{clearTimeout(watchdog);process.exit(confirmed?0:1);});
 server.closeAllConnections?.();
});
