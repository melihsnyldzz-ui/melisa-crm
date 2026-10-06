import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createCanonicalCatalogReader} from '../packages/erp-adapter/services/canonicalCatalogReader.mjs';
let token='',expiresAt=0;
async function getErpAuthorization({refresh=false}={}){
 if(!refresh&&token&&expiresAt>Date.now()+60000)return `Bearer ${token}`;
 if(!process.env.CRM_ERP_CATALOG_ACCESS_PATH)throw Error('ERP_AUTH_REQUIRED');
 if(!path.isAbsolute(process.env.CRM_ERP_CATALOG_ACCESS_PATH))throw Error('ERP_AUTH_REQUIRED');
 const privateAccess=JSON.parse(await readFile(process.env.CRM_ERP_CATALOG_ACCESS_PATH,'utf8'));
 const account=privateAccess.ilker;
 if(typeof account?.username!=='string'||typeof account?.password!=='string')throw Error('ERP_AUTH_REQUIRED');
 const response=await fetch('http://127.0.0.1:4144/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:account.username,password:account.password}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const payload=await response.json(),data=payload.data??payload;
 if(!response.ok||typeof data.accessToken!=='string'||!data.user?.permissions?.includes('product.view')||!data.user.permissions.includes('sales.view'))throw Error('ERP_AUTH_REQUIRED');
 token=data.accessToken;expiresAt=Date.now()+300000;return `Bearer ${token}`;
}
const reader=createCanonicalCatalogReader({crmOrigin:process.env.CRM_TEST_GATEWAY_ORIGIN||'http://127.0.0.1:62401',getErpAuthorization});
const server=http.createServer(async(req,res)=>{
 const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort()};req.once('aborted',cancel);res.once('close',cancel);
 try{const result=await reader(new Request('http://127.0.0.1:62402'+req.url,{method:req.method,headers:req.headers,signal:controller.signal}));const body=Buffer.from(await result.arrayBuffer());if(controller.signal.aborted)return;res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);}catch{if(!res.destroyed){res.writeHead(503);res.end();}}finally{req.removeListener('aborted',cancel);res.removeListener('close',cancel);}
}).listen(62402,'127.0.0.1');
server.on('error',()=>process.exit(1));process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
