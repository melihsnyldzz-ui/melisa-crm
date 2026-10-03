const PREFIX='/api/crm-catalog/products',CRM_ORIGIN='http://127.0.0.1:4200',DATABASE='MELISA_ERP_V2';
const ROLES=new Set(['patron','mudur','personel']);
export function normalizeCrmOrigin(value,{loopbackOnly=false}={}){
  let url;try{url=new URL(value)}catch{throw Error('CRM_ORIGIN_INVALID')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('CRM_ORIGIN_INVALID');
  if(loopbackOnly&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('TEST_CRM_LOOPBACK_REQUIRED');
  return url.origin;
}
const fail=(status,code)=>Response.json({success:false,error:{code,message:code}},{status,headers:{'cache-control':'no-store'}});
const error=(status,code)=>Object.assign(Error(code),{status,code});
// Pure developer contract, not installed/activated. No config, database, listener or credential imports.
export const EXISTING_UI_SOURCE=Object.freeze({productDatabase:'VEGA2026',imageDatabase:'MELISA_ERP_V2',version:'existing-stock-v1',source:'melisa-existing-erp-stock-read',internalProofSource:'crm-existing-stock-select-only'});
const TYPES=new Set(['patron','mudur','personel']);
export function sourceId(value){
  if(typeof value==='string'&&!/^[1-9][0-9]*$/.test(value))throw Error('SOURCE_ID_INVALID');
  if(typeof value!=='string'&&typeof value!=='number')throw Error('SOURCE_ID_INVALID');
  const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw Error('SOURCE_ID_INVALID');return id;
}
export const productId=value=>'vega-'+sourceId(value);
export function parseProductId(value){
  if(typeof value!=='string'||!/^vega-[1-9][0-9]*$/.test(value))throw Error('PRODUCT_ID_INVALID');return sourceId(value.slice(5));
}
export function safeImageReference(value){
  return typeof value==='string'&&value.length<=500&&!value.includes('..')&&/^\/uploads\/vega-products\/[A-Za-z0-9][A-Za-z0-9 ._-]*\.(?:jpe?g|png|webp)$/i.test(value)?value:null;
}
// Input is the fixed active-primary image SELECT, not a user-supplied URL or filename match.
export function resolvePrimaryImage(id,rows){
  const selected=rows.filter(row=>{try{return sourceId(row.sourceId)===sourceId(id)}catch{return false}});
  if(!selected.length)return{status:'missing',internalReference:null};
  const refs=selected.map(row=>safeImageReference(row.filePath));
  if(refs.some(value=>value===null))return{status:'unsafe-or-unknown',internalReference:null};
  const distinct=[...new Set(refs)];if(distinct.length!==1)return{status:'ambiguous-primary',internalReference:null};
  return{status:'guarded-reference',internalReference:distinct[0]};
}
const currencyAliases=new Map([['EUR','EUR'],['€','EUR'],['USD','USD'],['$','USD'],['US$','USD'],['TRY','TRY'],['TL','TRY'],['₺','TRY']]);
const number=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
const text=(value,max,required=false)=>{if(value==null&&!required)return null;if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw Error('PUBLIC_PRODUCT_CONTRACT');return value.trim()||null};
export function serializeProduct(row,activePrimaryImages){
  if(!(row?.is_active===true||row?.is_active===1))throw Error('ACTIVE_PRODUCT_REQUIRED');
  const id=productId(row.source_id),image=resolvePrimaryImage(row.source_id,activePrimaryImages);
  const price=number(row.sale_price),qty=number(row.stock_quantity);
  // Actual sale-unit PB1 only; no purchase-currency/default/fallback price.
  const currency=currencyAliases.get(typeof row.sale_currency==='string'?row.sale_currency.trim().toUpperCase():'')||null;
  return{id,stockCode:text(row.stock_code,120,true),productName:text(row.product_name,250,true),brand:text(row.brand,120),category:text(row.category,120),salePrice:price,currency,
    priceStatus:price===null||!currency?'unknown':price<0?'invalid':price===0?'zero-unverified':'recorded',priceBasis:'per-item',priceBasisStatus:'user-confirmed',
    stockQuantity:qty,stockStatus:qty===null?'unknown':qty===0?'zero-unverified':qty>0?'in-stock':'not-positive',
    photoPath:image.internalReference?`/crm/catalog/products/${id}/photo`:null,photoStatus:image.status==='guarded-reference'?'guarded-path':image.status,
    sourceUpdatedAt:null,pricedDocumentEligible:false,pricedDocumentBlockReason:'SOURCE_FRESHNESS_UNVERIFIED'};
}
export function assertSourceProof(meta,currentActor){
  if(meta?.source!==EXISTING_UI_SOURCE.internalProofSource||meta.productDatabaseName!==EXISTING_UI_SOURCE.productDatabase||meta.imageDatabaseName!==EXISTING_UI_SOURCE.imageDatabase||meta.productDatabaseVerified!==true||meta.imageDatabaseVerified!==true||meta.sourceDatabaseVerified!==true)throw Error('ERP_SOURCE_IDENTITY_REQUIRED');
  if(!currentActor?.id||currentActor.active!==true||!TYPES.has(currentActor.role)||!Array.isArray(currentActor.permissions)||!currentActor.permissions.includes('crm.view')||String(meta.verifiedCrmActorId)!==String(currentActor.id)||meta.verifiedCrmRole!==currentActor.role)throw Error('CRM_SOURCE_ACTOR_MISMATCH');
}
export function sourceMeta(fetchedAt,proof,currentActor){
  assertSourceProof(proof,currentActor);
  if(typeof fetchedAt!=='string'||!Number.isFinite(Date.parse(fetchedAt)))throw Error('READ_TIMESTAMP_REQUIRED');
  return{source:EXISTING_UI_SOURCE.source,catalogVersion:EXISTING_UI_SOURCE.version,sourceDatabases:{products:EXISTING_UI_SOURCE.productDatabase,images:EXISTING_UI_SOURCE.imageDatabase},sourceDatabaseVerified:true,fetchedAt,cached:false,sourceUpdatedAt:null,stockFreshness:'unverified',photoEligibility:'guarded-existing-ui-reference',capabilities:{read:true,unpricedCatalog:true,pricedPdf:false}};
}

// Candidate code inlined into the ERP source service by the packager; not a seventh deployment file.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const workerUrl=new URL('../workers/crmExistingStockReadWorker.mjs',import.meta.url);
export function runExistingStockWorker(options,eligibleIds,signal,{spawnProcess=spawn,timeoutMs=14000,terminationMs=1000}={}){
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(Error('ERP_CATALOG_REQUEST_CANCELLED'));
    const payload=JSON.stringify({options,eligibleIds});if(Buffer.byteLength(payload)>65536)return reject(Error('WORKER_INPUT_LIMIT'));
    // Same existing host account, ordinary node worker, existing API cwd. No token/credential in stdin.
    const child=spawnProcess(process.execPath,[fileURLToPath(workerUrl),'--runtime-read'],{cwd:process.cwd(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',settled=false,stopping=false,pendingError=null,terminationTimer;
    const timer=setTimeout(()=>finish(Error('ERP_EXISTING_STOCK_READ_UNAVAILABLE')),timeoutMs);
    const abort=()=>finish(Error('ERP_CATALOG_REQUEST_CANCELLED'));
    function complete(error,value){if(settled)return;settled=true;clearTimeout(timer);clearTimeout(terminationTimer);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value)}
    function finish(error,value){
      if(settled||stopping)return;
      if(!error)return complete(null,value);
      stopping=true;pendingError=error;clearTimeout(timer);
      // Only this newly spawned child is stopped. Wait for close confirmation before returning.
      terminationTimer=setTimeout(()=>complete(Error('WORKER_TERMINATION_UNCONFIRMED')),terminationMs);
      try{child.kill()}catch{};
    }
    signal.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{if(settled||stopping)return;stdout+=chunk;if(Buffer.byteLength(stdout)>1024*1024)finish(Error('WORKER_OUTPUT_LIMIT'))});
    child.stderr.on('data',()=>{}); // Driver stderr is never relayed to the CRM, logs or browser.
    child.on('error',()=>finish(Error('ERP_EXISTING_STOCK_READ_UNAVAILABLE')));
    child.stdin.on('error',()=>finish(Error('ERP_EXISTING_STOCK_READ_UNAVAILABLE')));
    child.on('close',code=>{
      if(settled)return;
      if(stopping)return complete(pendingError);
      try{const body=JSON.parse(stdout.trim());if(code!==0||body?.success!==true||body.data?.databaseName!=='VEGA2026'||body.data.databaseVerified!==true)throw Error('ERP_EXISTING_STOCK_READ_UNAVAILABLE');complete(null,body.data)}catch{complete(Error('ERP_EXISTING_STOCK_READ_UNAVAILABLE'))}
    });
    child.stdin.end(payload);
  });
}

async function json(response,max=65536){
  if(!response.body||!response.headers.get('content-type')?.startsWith('application/json'))throw error(503,'CRM_VERIFICATION_UNAVAILABLE');
  const reader=response.body.getReader(),parts=[];let count=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;count+=value.length;if(count>max){await reader.cancel();throw error(503,'CRM_VERIFICATION_UNAVAILABLE')}parts.push(value)}}finally{reader.releaseLock()}
  try{return JSON.parse(Buffer.concat(parts.map(value=>Buffer.from(value))).toString())}catch{throw error(503,'CRM_VERIFICATION_UNAVAILABLE')}
}
export const CATALOG_SQL=Object.freeze({identity:'SELECT DB_NAME() AS databaseName;',images:`IF DB_NAME()<>N'MELISA_ERP_V2' THROW 51000,N'ERP_SOURCE_IDENTITY_REQUIRED',1; SELECT DB_NAME() AS databaseName; SELECT TOP(2001) vega_source_id AS sourceId,file_path AS filePath FROM dbo.vega_product_images WHERE is_active=1 AND is_primary=1 ORDER BY vega_source_id,id; SELECT DB_NAME() AS databaseName;`});
export function createCrmCatalogReadSource({activationApproved=false,transport,getSqlPool,getSqlDriver,readExistingStock,now=Date.now,crmOrigin=CRM_ORIGIN}={}){
  const authenticationOrigin=normalizeCrmOrigin(crmOrigin);
  if(activationApproved&&![transport,getSqlPool,getSqlDriver,readExistingStock].every(value=>typeof value==='function'))throw Error('EXPLICIT_READ_DEPENDENCIES_REQUIRED');
  async function current(request,signal){
    const authorization=request.headers.get('authorization')||'';if(!/^Bearer [^\s]+$/.test(authorization))throw error(401,'WHATSAPP_CRM_AUTH_TOKEN_REQUIRED');
    let response;try{response=await transport(new URL('/auth/me',authenticationOrigin),{method:'GET',headers:{accept:'application/json',authorization},redirect:'manual',credentials:'omit',cache:'no-store',signal})}catch{throw error(503,'CRM_VERIFICATION_UNAVAILABLE')}
    const body=await json(response);
    if(response.status!==200){const allowed=new Set(['AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','WHATSAPP_CRM_AUTH_TOKEN_REQUIRED','WHATSAPP_CRM_RATE_LIMITED']);throw error([401,403,429].includes(response.status)?response.status:503,allowed.has(body.error?.code)?body.error.code:'CRM_VERIFICATION_UNAVAILABLE')}
    const actor=body.data;if(body.success!==true||body.meta?.source!=='crm-auth'||!actor?.id||!ROLES.has(actor.role)||!Array.isArray(actor.permissions)||!actor.permissions.includes('crm.view'))throw error(403,'CRM_CATALOG_SCOPE_REQUIRED');
    if(body.meta.catalogRead!==true)throw error(401,'CATALOG_SESSION_REVOKED');return actor;
  }
  async function query(pool,driver,sqlText,bindings,signal){
    if(signal.aborted)throw error(503,'ERP_CATALOG_REQUEST_CANCELLED');const request=pool.request();
    for(const[name,type,value]of bindings)request.input(name,type==='NVarChar'?driver.NVarChar(name==='search'?122:120):driver[type],value);
    const cancel=()=>request.cancel?.();signal.addEventListener('abort',cancel,{once:true});
    try{const result=await request.query(sqlText);if(signal.aborted)throw error(503,'ERP_CATALOG_REQUEST_CANCELLED');return result}finally{signal.removeEventListener('abort',cancel)}
  }
  return async function handle(request){
    const url=new URL(request.url),tail=url.pathname.slice(PREFIX.length);if(request.method!=='GET')return fail(405,'GET_ONLY');
    if(!url.pathname.startsWith(PREFIX)||! /^(?:|\/vega-[1-9][0-9]*)$/.test(tail))return fail(404,'ROUTE_NOT_ALLOWED');
    const id=tail?tail.slice(1):null,values={search:'',brand:'',category:'',hasImage:true,page:1,limit:24};
    let numericId=null;if(id){try{numericId=parseProductId(id)}catch{return fail(400,'INVALID_PRODUCT_ID')}}
    for(const[key,value]of url.searchParams){if(id||!Object.hasOwn(values,key)||url.searchParams.getAll(key).length!==1)return fail(400,'INVALID_QUERY');if(['search','brand','category'].includes(key)){if(value.length>120)return fail(400,'INVALID_QUERY');values[key]=value.trim()}else if(key==='hasImage'){if(!['true','false'].includes(value))return fail(400,'INVALID_QUERY');values.hasImage=value==='true'}else{if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(+value)||key==='limit'&&+value>100)return fail(400,'INVALID_QUERY');values[key]=+value}}
    const offset=(values.page-1)*values.limit;if(!Number.isSafeInteger(offset)||offset>2147483647)return fail(400,'INVALID_QUERY');
    if(!activationApproved)return fail(503,'SINGLE_LOGIN_NOT_ACTIVATED');
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]);
    try{
      const actor=await current(request,signal);if(signal.aborted)throw error(503,'ERP_CATALOG_REQUEST_CANCELLED');
      const pool=await getSqlPool(),driver=getSqlDriver();const identity=await query(pool,driver,CATALOG_SQL.identity,[],signal);
      if(identity.recordset?.[0]?.databaseName!==DATABASE)throw error(503,'ERP_SOURCE_IDENTITY_REQUIRED');
      const imageRead=await query(pool,driver,CATALOG_SQL.images,[],signal),sets=imageRead.recordsets;
      if(!Array.isArray(sets)||sets.length!==3||sets[0]?.[0]?.databaseName!==DATABASE||sets[2]?.[0]?.databaseName!==DATABASE||!Array.isArray(sets[1])||sets[1].length>2000)throw error(503,'ERP_SOURCE_IDENTITY_REQUIRED');
      const images=sets[1].map(row=>({sourceId:sourceId(row.sourceId),filePath:row.filePath}));
      const eligibleIds=[...new Set(images.map(row=>row.sourceId))].filter(id=>resolvePrimaryImage(id,images).internalReference!==null);
      const result=await readExistingStock(id?{id:numericId}:{...values,offset},eligibleIds,signal);
      if(result?.databaseName!=='VEGA2026'||result.databaseVerified!==true||!Array.isArray(result.rows))throw error(503,'ERP_SOURCE_IDENTITY_REQUIRED');
      const verified=await current(request,signal);if(String(verified.id)!==String(actor.id)||verified.role!==actor.role)throw error(401,'CATALOG_SESSION_REVOKED');
      const meta={source:'crm-existing-stock-select-only',productDatabaseName:'VEGA2026',imageDatabaseName:DATABASE,productDatabaseVerified:true,imageDatabaseVerified:true,sourceDatabaseVerified:true,verifiedCrmActorId:String(actor.id),verifiedCrmRole:actor.role,fetchedAt:new Date(now()).toISOString(),sourceUpdatedAt:null,cached:false};
      const data=result.rows.map(row=>({...serializeProduct(row,images),isActive:true,imageUrl:resolvePrimaryImage(row.source_id,images).internalReference}));
      if(id){if(data.length===0)return fail(404,'PRODUCT_NOT_FOUND');if(data.length!==1||data[0].id!==id)throw error(502,'ERP_CATALOG_PRODUCT_CONTRACT');return Response.json({success:true,data:data[0],meta},{headers:{'cache-control':'no-store'}})}
      const {total,totalPhotoEligible}=result.counts||{};
      if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(totalPhotoEligible)||totalPhotoEligible<0||totalPhotoEligible>total||data.length!==Math.min(values.limit,Math.max(0,total-offset))||values.hasImage&&data.some(row=>!row.imageUrl))throw error(502,'ERP_CATALOG_LIST_CONTRACT');
      const facets=rows=>{if(!Array.isArray(rows)||rows.length>500)throw error(502,'ERP_CATALOG_LIST_CONTRACT');return rows.map(row=>{if(typeof row?.value!=='string'||!row.value||row.value.length>120||row.value!==row.value.trim()||!Number.isSafeInteger(row.count)||row.count<1)throw error(502,'ERP_CATALOG_LIST_CONTRACT');return{value:row.value,count:row.count}})};
      return Response.json({success:true,data,meta:{...meta,page:values.page,limit:values.limit,total,totalPhotoEligible,totalPages:Math.max(1,Math.ceil(total/values.limit)),hasNextPage:offset+values.limit<total,hasPreviousPage:values.page>1,filters:{search:values.search,brand:values.brand||null,category:values.category||null,hasImage:values.hasImage},facets:{scope:'current-query-excluding-own-facet',brands:facets(result.brands),categories:facets(result.categories)},photoEligibility:'guarded-existing-ui-reference'}},{headers:{'cache-control':'no-store'}});
    }catch(cause){console.error(JSON.stringify({catalogError:/^[A-Z0-9_]{1,80}$/.test(cause?.message||'')?cause.message:'ERP_CATALOG_SQL_UNAVAILABLE',sqlCode:cause?.code,sqlNumber:cause?.number}));return fail(cause?.status||503,cause?.code||'ERP_CATALOG_SQL_UNAVAILABLE')}
  };
}
