import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {normalizeCrmOrigin} from '../packages/erp-adapter/services/crmCatalogReadSource.mjs';
const crmOrigin=normalizeCrmOrigin(process.env.CRM_TEST_GATEWAY_ORIGIN||'http://127.0.0.1:62401',{loopbackOnly:true});
const root=process.env.CRM_ERP_API_ROOT;
if(!root)throw Error('CRM_ERP_API_ROOT_REQUIRED');
process.chdir(root);
Object.assign(process.env,{SQL_DATABASE:'MELISA_ERP_FULL_TEST_20260916',SQL_READ_ONLY:'false',MELISA_TEST_WRITE_ENABLED:'true'});
const {env}=await import(pathToFileURL(root+'/src/config/env.js'));
if(env.sql.database!=='MELISA_ERP_FULL_TEST_20260916')throw Error('TEST_DATABASE_REQUIRED');
const database=await import(pathToFileURL(root+'/src/config/database.js'));
const auth=await import(pathToFileURL(root+'/src/services/authService.js'));
const pipeline=await import(pathToFileURL(root+'/src/services/salesPipelineService.js'));
const operations=new Map();
const loginAttempts=new Map();
function fail(code,status=400){throw Object.assign(Error(code),{code,statusCode:status});}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)fail('ERP_REQUEST_TOO_LARGE',413);}return JSON.parse(text||'{}');}
async function crmActor(req){const authorization=req.headers.authorization;if(!authorization)fail('CRM_SESSION_REQUIRED',401);const r=await fetch(new URL('/auth/me',crmOrigin),{headers:{authorization},redirect:'error',signal:AbortSignal.timeout(10000)});const result=await r.json();if(!r.ok||!result.data?.permissions?.includes('crm.send'))fail('CRM_ORDER_PERMISSION_REQUIRED',403);return result.data;}
async function erpActor(req,permission){const token=req.headers['x-erp-token'];if(!token)fail('ERP_LOGIN_REQUIRED',401);const payload=auth.verifyAccessToken(token),user=await auth.getUserById(payload.sub);if(!user?.permissions?.includes(permission))fail('ERP_PERMISSION_REQUIRED',403);return user;}
async function testPool(){const pool=await database.getSqlPool();const identity=await pool.request().query('SELECT DB_NAME() AS name;');if(identity.recordset[0]?.name!=='MELISA_ERP_FULL_TEST_20260916')fail('TEST_DATABASE_REQUIRED',503);return pool;}
const server=http.createServer(async(req,res)=>{
 res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
 try{
  const current=await crmActor(req),url=new URL(req.url,'http://localhost');let data;
  if(req.method==='POST'&&url.pathname==='/crm/erp/login'){
   const recent=(loginAttempts.get(current.id)||[]).filter(at=>at>Date.now()-900000);
   if(recent.length>=5)fail('ERP_LOGIN_RATE_LIMIT',429);recent.push(Date.now());loginAttempts.set(current.id,recent);
   const credentials=await body(req);const result=await auth.login({username:credentials.username,password:credentials.password},'Melisa CRM TEST');
   if(!result.user?.permissions?.includes('sales.create'))fail('ERP_PERMISSION_REQUIRED',403);
   data={accessToken:result.accessToken,user:{id:result.user.id,displayName:result.user.displayName},database:'MELISA_ERP_FULL_TEST_20260916'};
  }else if(req.method==='GET'&&url.pathname==='/crm/erp/customers'){
   await erpActor(req,'sales.create');const pool=await testPool(),driver=database.getSqlDriver(),search=(url.searchParams.get('search')||'').trim().slice(0,100);
   const result=await pool.request().input('search',driver.NVarChar(102),'%'+search+'%').query('SELECT TOP(30) id,name,currency_code AS currency FROM dbo.customers WHERE is_deleted=0 AND name LIKE @search ORDER BY name,id;');data={customers:result.recordset};
   }else if(req.method==='GET'&&url.pathname==='/crm/erp/drafts'){
   if(!current.permissions?.includes('crm.manage'))fail('ERP_PERMISSION_REQUIRED',403);
   const pool=await testPool();const result=await pool.request().query("SELECT TOP(30) o.id,o.document_no AS documentNo,c.name AS customer,o.document_currency AS currency,o.grand_total AS total,o.status,o.created_at AS createdAt,COUNT(i.id) AS lines FROM dbo.sales_orders o JOIN dbo.customers c ON c.id=o.customer_id JOIN dbo.sales_order_items i ON i.sales_order_id=o.id WHERE o.description LIKE N'CRM TEST · konuşma %' GROUP BY o.id,o.document_no,c.name,o.document_currency,o.grand_total,o.status,o.created_at ORDER BY o.id DESC;");
   data={orders:result.recordset.map(order=>({...order,id:String(order.id),total:order.currency+' '+Number(order.total).toFixed(2),status:order.status==='draft'?'ERP TEST taslağı':order.status,owner:'ERP TEST',updated:new Date(order.createdAt).toLocaleString('tr-TR')}))};
  }else if(req.method==='POST'&&url.pathname==='/crm/erp/drafts'){
   const actor=await erpActor(req,'sales.create'),input=await body(req),pool=await testPool(),driver=database.getSqlDriver();
   if(!/^[0-9a-f-]{36}$/i.test(input.requestId||'')||!Array.isArray(input.items)||!input.items.length||input.items.length>50||!Number.isSafeInteger(input.customerId)||input.customerId<1)fail('ERP_DRAFT_INVALID');
   const documentNo='CRM-'+input.requestId.replaceAll('-','').slice(0,24),fingerprint=crypto.createHash('sha256').update(JSON.stringify([actor.id,current.id,input.customerId,input.items,input.exchangeRate])).digest('hex');
   const existing=await pool.request().input('number',driver.NVarChar(30),documentNo).query('SELECT id,description FROM dbo.sales_orders WHERE document_no=@number;');
   if(existing.recordset.length){if(existing.recordset.length!==1||!existing.recordset[0].description?.includes(fingerprint))fail('ERP_DRAFT_CONFLICT',409);data=await pipeline.getPipelineDocument('order',existing.recordset[0].id);}
   else {
    if(operations.has(documentNo))fail('ERP_DRAFT_IN_PROGRESS',409);operations.set(documentNo,true);
    try{
     const items=[];
     for(const line of input.items){
      if(typeof line.stockCode!=='string'||!line.stockCode.trim()||line.stockCode.length>120||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>9999||typeof line.unitPrice!=='number'||!Number.isFinite(line.unitPrice)||line.unitPrice<0||!['TRY','USD','EUR'].includes(line.currency))fail('ERP_DRAFT_LINE_INVALID');
      const product=await pool.request().input('code',driver.NVarChar(120),line.stockCode).query('SELECT id,stock_code,name FROM dbo.products WHERE stock_code=@code AND is_deleted=0 AND is_active=1;');
      if(product.recordset.length!==1)fail('ERP_PRODUCT_MAPPING_REQUIRED',409);
      items.push({productId:Number(product.recordset[0].id),stockCode:product.recordset[0].stock_code,productName:product.recordset[0].name,quantity:line.quantity,unitPrice:line.unitPrice,currency:line.currency});
     }
     if(new Set(items.map(line=>line.productId)).size!==items.length||new Set(items.map(line=>line.currency)).size!==1||typeof input.exchangeRate!=='number'||!Number.isFinite(input.exchangeRate)||input.exchangeRate<=0)fail('ERP_DRAFT_LINE_INVALID');
     data=await pipeline.createPipelineDocument('order',{documentNo,customerId:input.customerId,documentCurrency:items[0].currency,exchangeRate:input.exchangeRate,items,description:`CRM TEST · konuşma ${input.conversationId} · ${fingerprint}`},actor);
    }finally{operations.delete(documentNo);}
   }
   data={...data,erpPersisted:true,testOnly:true,database:'MELISA_ERP_FULL_TEST_20260916',stockEffect:false};
  }else fail('ERP_ROUTE_NOT_FOUND',404);
  res.writeHead(200);res.end(JSON.stringify({success:true,data}));
 }catch(error){const code=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'ERP_TEST_REQUEST_FAILED';const messages={AUTH_INVALID_CREDENTIALS:'ERP kullanıcı adı veya parola doğru değil.',ERP_LOGIN_REQUIRED:'Mevcut ERP hesabınızla giriş yapın.',ERP_PERMISSION_REQUIRED:'Bu ERP hesabının sipariş oluşturma yetkisi yok.',ERP_PRODUCT_MAPPING_REQUIRED:'Seçilen ürünün TEST ERP kaydı tek olarak eşleşmedi. Taslak kaydedilmedi.',ERP_DRAFT_LINE_INVALID:'Ürün adedi, satış fiyatı, para birimi veya kuru kontrol edin.',ERP_LOGIN_RATE_LIMIT:'Çok fazla giriş denemesi yapıldı. Bir süre sonra tekrar deneyin.',SQL_WRITE_TARGET_INVALID:'Bu ERP TEST ortamında CRM sipariş taslağı bağlantısı henüz hazır değil. Taslak kaydedilmedi; ürün seçiminiz korunuyor.'};res.writeHead(error.statusCode||503);res.end(JSON.stringify({success:false,error:{code,message:messages[code]||'ERP TEST işlemi tamamlanamadı. Seçiminiz korunuyor.'}}));}
}).listen(62403,'127.0.0.1',()=>console.log('ERP TEST taslak servisi hazır.'));
server.on('error',error=>{console.error(error.code);process.exit(1);});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
