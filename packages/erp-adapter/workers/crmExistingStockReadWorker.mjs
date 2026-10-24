// Isolated read worker: follows the existing ERP's separate-driver process architecture.
// No local Windows SQL driver, token, CRM password or business write in this process.
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const apiRoot=process.env.CRM_ERP_API_ROOT;
const active=`ISNULL(s.DELETED,0)=0 AND ISNULL(s.IPTAL,0)=0 AND ISNULL(s.STATUS,0)=1`;
const search=`(@search IS NULL OR s.STOKKODU COLLATE Turkish_100_CI_AI LIKE @search OR s.MALINCINSI COLLATE Turkish_100_CI_AI LIKE @search OR s.KOD1 COLLATE Turkish_100_CI_AI LIKE @search OR s.KOD4 COLLATE Turkish_100_CI_AI LIKE @search)`;
const brand=`(@brand IS NULL OR LTRIM(RTRIM(s.KOD1))=@brand)`,category=`(@category IS NULL OR LTRIM(RTRIM(s.KOD4))=@category)`;
const unit=`OUTER APPLY(SELECT TOP(1) BIRIMADI,SATISFIYATI1,PB1 FROM dbo.F0102TBLBIRIMLEREX WHERE STOKNO=s.IND ORDER BY CASE WHEN ISNULL(VARSAYILAN,0)=1 THEN 0 ELSE 1 END,CASE WHEN ISNULL(ANABIRIM,0)=1 THEN 0 ELSE 1 END,IND ASC)u`;
const stock=`OUTER APPLY(SELECT COUNT_BIG(1) AS movement_count,SUM(ISNULL(GIREN,0)-ISNULL(CIKAN,0)) AS quantity FROM dbo.F0102D0007TBLSTOKHAREKETLERI WHERE STOKNO=p.source_id)m`;
const fields=`CONVERT(varchar(20),s.IND) AS source_id,s.STOKKODU AS stock_code,s.MALINCINSI AS product_name,LTRIM(RTRIM(s.KOD1)) AS brand,LTRIM(RTRIM(s.KOD4)) AS category,u.SATISFIYATI1 AS sale_price,u.PB1 AS sale_currency,s.KALAN AS fallback_quantity,CAST(1 AS bit) AS is_active`;
const output=`p.source_id,p.stock_code,p.product_name,p.brand,p.category,p.sale_price,p.sale_currency,p.is_active,CASE WHEN m.movement_count>0 THEN m.quantity ELSE p.fallback_quantity END AS stock_quantity`;
export function buildReadPlan(options,eligibleIds=[]){
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error('INVALID_QUERY');
  if(!Array.isArray(eligibleIds)||eligibleIds.length>2000||eligibleIds.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(eligibleIds).size!==eligibleIds.length)throw Error('IMAGE_SCOPE_INVALID');
  const bindings=[];
  if(Object.hasOwn(options,'id')){
    if(Object.keys(options).some(key=>key!=='id'))throw Error('INVALID_QUERY');
    if(!Number.isSafeInteger(options.id)||options.id<1)throw Error('PRODUCT_ID_INVALID');bindings.push(['id','BigInt',options.id]);
    return{bindings,sql:`WITH p AS(SELECT ${fields} FROM dbo.F0102TBLSTOKLAR s ${unit} WHERE ${active} AND s.IND=@id) SELECT ${output} FROM p ${stock};`};
  }
  if(Object.keys(options).some(key=>!['page','limit','offset','hasImage','search','brand','category'].includes(key))||!Number.isSafeInteger(options.page)||options.page<1||!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>100||!Number.isSafeInteger(options.offset)||options.offset<0||options.offset>2147483647||options.offset!==(options.page-1)*options.limit||typeof options.hasImage!=='boolean')throw Error('INVALID_QUERY');
  for(const key of ['search','brand','category'])if(typeof options[key]!=='string'||options[key].length>120||options[key]!==options[key].trim())throw Error('INVALID_QUERY');
  // Validated integer IDs are data in one bounded parameter, never SQL text.
  // Detail reads do not need or bind the list's image eligibility scope.
  if(eligibleIds.length)bindings.push(['imageIds','Xml','<ids>'+eligibleIds.map(id=>'<id>'+id+'</id>').join('')+'</ids>']);
  // Tedious transports Xml input as text. Parse the bound value once in a
  // scalar variable after the batch's source identity guard.
  const imageDeclaration=eligibleIds.length?'DECLARE @imageScope xml=CONVERT(xml,@imageIds);':'';
  const imageRows=`SELECT imageNode.value('(text())[1]','bigint') AS id FROM @imageScope.nodes('/ids/id') AS imageSet(imageNode)`;
  // hasImage is a validated internal boolean. Restrict photo-only reads to the
  // unique eligible scope before grouping; all-product reads retain a left join.
  const from=eligibleIds.length?(options.hasImage?`(${imageRows}) imageScope INNER LOOP JOIN dbo.F0102TBLSTOKLAR s ON s.IND=imageScope.id`:`dbo.F0102TBLSTOKLAR s LEFT HASH JOIN (${imageRows}) imageScope ON imageScope.id=s.IND`):'dbo.F0102TBLSTOKLAR s';
  const image=eligibleIds.length?'imageScope.id IS NOT NULL':'1=0';
  bindings.push(['search','NVarChar',options.search?'%'+options.search+'%':null],['brand','NVarChar',options.brand||null],['category','NVarChar',options.category||null],['hasImage','Bit',options.hasImage],['offset','Int',options.offset],['limit','Int',options.limit]);
  const photo=options.hasImage?image:'1=1',base=`${active} AND ${search}`,filter=`${base} AND ${brand} AND ${category} AND ${photo}`;
  return{bindings,sql:`${imageDeclaration}
    SELECT COALESCE(SUM(CONVERT(bigint,CASE WHEN ${photo} THEN 1 ELSE 0 END)),0) AS total,COALESCE(SUM(CONVERT(bigint,CASE WHEN ${image} THEN 1 ELSE 0 END)),0) AS totalPhotoEligible FROM ${from} WHERE ${base} AND ${brand} AND ${category};
    WITH p AS(SELECT ${fields},s.KARTINACILMATARIHI AS internal_page_date FROM ${from} ${unit} WHERE ${filter} ORDER BY s.KARTINACILMATARIHI DESC,s.IND DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY)
    SELECT ${output} FROM p ${stock} ORDER BY p.internal_page_date DESC,CONVERT(bigint,p.source_id) DESC;
    SELECT TOP(501) LTRIM(RTRIM(s.KOD1)) AS value,COUNT_BIG(1) AS count FROM ${from} WHERE ${base} AND ${category} AND ${photo} AND NULLIF(LTRIM(RTRIM(s.KOD1)),N'') IS NOT NULL GROUP BY LTRIM(RTRIM(s.KOD1)) ORDER BY LTRIM(RTRIM(s.KOD1));
    SELECT TOP(501) LTRIM(RTRIM(s.KOD4)) AS value,COUNT_BIG(1) AS count FROM ${from} WHERE ${base} AND ${brand} AND ${photo} AND NULLIF(LTRIM(RTRIM(s.KOD4)),N'') IS NOT NULL GROUP BY LTRIM(RTRIM(s.KOD4)) ORDER BY LTRIM(RTRIM(s.KOD4));`};
}
const publicFields=['source_id','stock_code','product_name','brand','category','sale_price','sale_currency','stock_quantity','is_active'];
const fieldText=(value,max,required=false)=>{
  if(value==null&&!required)return null;
  if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())throw Error('ERP_PRODUCT_CONTRACT_REQUIRED');
  return value.trim()||null;
};
const fieldNumber=value=>{
  if(value==null||typeof value==='string')return null; // Do not coerce driver strings or missing values into zero.
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('ERP_PRODUCT_CONTRACT_REQUIRED');
  return value;
};
const project=row=>({source_id:row.source_id,stock_code:fieldText(row.stock_code,120,true),product_name:fieldText(row.product_name,250,true),brand:fieldText(row.brand,120),category:fieldText(row.category,120),sale_price:fieldNumber(row.sale_price),sale_currency:fieldText(row.sale_currency,16),stock_quantity:fieldNumber(row.stock_quantity),is_active:row.is_active});
const count=value=>Number.isSafeInteger(value)&&value>=0;
export function aggregateCount(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!count(parsed)) throw Error('ERP_PAGINATION_CONTRACT_REQUIRED');
  return parsed;
}
function facets(rows){
  if(!Array.isArray(rows)||rows.length>500)throw Error('ERP_FACET_CONTRACT_REQUIRED');
  const seen=new Set();return rows.map(row=>{
    const total=aggregateCount(row?.count);
    if(typeof row?.value!=='string'||!row.value||row.value!==row.value.trim()||row.value.length>120||seen.has(row.value)||total===0)throw Error('ERP_FACET_CONTRACT_REQUIRED');
    seen.add(row.value);return{value:row.value,count:total};
  });
}
function rowsProjection(rows){
  if(!Array.isArray(rows))throw Error('ERP_PRODUCT_CONTRACT_REQUIRED');
  const ids=new Set();return rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.source_id!=='string'||!/^[1-9][0-9]*$/.test(row.source_id)||!Number.isSafeInteger(Number(row.source_id))||ids.has(row.source_id)||!(row.is_active===true||row.is_active===1))throw Error('ERP_PRODUCT_CONTRACT_REQUIRED');
    ids.add(row.source_id);return project(row);
  });
}
export async function executeRead({options,eligibleIds,getPool,driver}){
  const plan=buildReadPlan(options,eligibleIds),pool=await getPool();
  const request=pool.request();for(const[name,type,value]of plan.bindings)request.input(name,type==='NVarChar'?driver.NVarChar(name==='search'?122:120):driver[type],value);
  // Guard and both proof rows execute in THIS product batch on the same leased connection.
  // No proof is inferred from another pool.request(), configured DB name or a different socket.
  const result=await request.query(`IF DB_NAME()<>N'VEGA2026' THROW 51000,N'ERP_PRODUCT_SOURCE_IDENTITY_REQUIRED',1; SELECT DB_NAME() AS databaseName; ${plan.sql} SELECT DB_NAME() AS databaseName;`);
  const sets=result.recordsets,expectedSets=Object.hasOwn(options,'id')?3:6;
  if(!Array.isArray(sets)||sets.length!==expectedSets||sets[0]?.length!==1||sets.at(-1)?.length!==1||sets[0][0]?.databaseName!=='VEGA2026'||sets.at(-1)[0]?.databaseName!=='VEGA2026')throw Error('ERP_PRODUCT_SOURCE_IDENTITY_REQUIRED');
  if(Object.hasOwn(options,'id')){
    const rows=rowsProjection(sets[1]);
    if(rows.length>1||rows.some(row=>Number(row.source_id)!==options.id))throw Error('ERP_PRODUCT_CONTRACT_REQUIRED');
    return{databaseName:'VEGA2026',databaseVerified:true,rows};
  }
  if(sets[1]?.length!==1)throw Error('ERP_PAGINATION_CONTRACT_REQUIRED');
  const counts={total:aggregateCount(sets[1][0].total),totalPhotoEligible:aggregateCount(sets[1][0].totalPhotoEligible)},rows=rowsProjection(sets[2]);
  if(!count(counts?.total)||!count(counts?.totalPhotoEligible)||counts.totalPhotoEligible>counts.total||options.hasImage&&counts.totalPhotoEligible!==counts.total||rows.length!==Math.min(options.limit,Math.max(0,counts.total-options.offset)))throw Error('ERP_PAGINATION_CONTRACT_REQUIRED');
  if(options.hasImage&&rows.some(row=>!eligibleIds.includes(Number(row.source_id))))throw Error('ERP_PHOTO_SCOPE_REQUIRED');
  return{databaseName:'VEGA2026',databaseVerified:true,counts:{total:counts.total,totalPhotoEligible:counts.totalPhotoEligible},rows,brands:facets(sets[3]),categories:facets(sets[4])};
}
async function run(){
  let module;
  try{
    if(!apiRoot)throw Error('CRM_ERP_API_ROOT_REQUIRED');
    if(path.resolve(process.cwd()).toLowerCase()!==path.resolve(apiRoot).toLowerCase())throw Error('EXACT_NORMAL_API_CWD_REQUIRED');
    let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>65536)throw Error('WORKER_INPUT_LIMIT')}
    const input=JSON.parse(raw);module=await import(pathToFileURL(apiRoot+'/src/config/vegaDatabase.js'));
    const driver=(await import(pathToFileURL(apiRoot+'/node_modules/mssql/tedious.js'))).default;
    const result=await executeRead({options:input.options,eligibleIds:input.eligibleIds,getPool:module.getVegaSqlPool,driver});
    process.stdout.write(JSON.stringify({success:true,data:result})+'\n');
  }catch(error){const code=typeof error?.message==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.message)?error.message:'ERP_EXISTING_STOCK_READ_UNAVAILABLE';process.stdout.write(JSON.stringify({success:false,error:{code}})+'\n')}
  finally{if(module)try{await Promise.race([module.closeVegaSqlPool(),new Promise(resolve=>setTimeout(resolve,500))])}catch{}}
  await new Promise(resolve=>process.stdout.write('',resolve));process.exit(0);
}
if(process.argv[1]&&path.resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()&&process.argv.includes('--runtime-read'))await run();

// Line protocol is internal to the bounded CRM reader pool; no credentials or
// user/role state enters a job. executeRead verifies the source on every batch.
async function runPersistent(){
 let module,driver,scopeHash,buffer=Buffer.alloc(0),busy=false,ending=false,closed=false;
 const signature=()=>createHash('sha256').update(JSON.stringify({cwd:path.resolve(process.cwd()).toLowerCase(),apiRoot:process.env.CRM_ERP_API_ROOT?path.resolve(process.env.CRM_ERP_API_ROOT).toLowerCase():null,env:Object.keys(process.env).filter(key=>/^(VEGA_|SQL_|CRM_ERP_)/.test(key)).sort().map(key=>[key,process.env[key]])})).digest('hex');
 const currentScope=()=>process.env.SQL_READ_ONLY==='true'&&path.resolve(process.cwd()).toLowerCase()===path.resolve(apiRoot).toLowerCase()&&signature()===scopeHash;
 async function shutdown(){if(closed)return;closed=true;try{await module?.closeVegaSqlPool?.();}catch{}process.exit(0);}
 async function consume(line){
  if(busy||ending){await shutdown();return;}busy=true;let jobId;
  try{
   const input=JSON.parse(line);jobId=input?.jobId;
   if(!/^[1-9][0-9]*$/.test(jobId||'')||!Number.isSafeInteger(Number(jobId))||Object.keys(input).some(key=>!['jobId','options','eligibleIds'].includes(key)))throw Error('WORKER_PROTOCOL_INVALID');
   if(!currentScope())throw Error('WORKER_CONFIGURATION_CHANGED');
   const data=await executeRead({options:input.options,eligibleIds:input.eligibleIds,getPool:module.getVegaSqlPool,driver});
   if(!currentScope())throw Error('WORKER_CONFIGURATION_CHANGED');
   const output=JSON.stringify({jobId,success:true,data});if(Buffer.byteLength(output)>1024*1024)throw Error('WORKER_OUTPUT_LIMIT');
   await new Promise((resolve,reject)=>process.stdout.write(output+'\n',error=>error?reject(error):resolve()));
  }catch(error){const code=typeof error?.message==='string'&&/^[A-Z0-9_]{1,60}$/.test(error.message)?error.message:'ERP_EXISTING_STOCK_READ_UNAVAILABLE';if(jobId)process.stdout.write(JSON.stringify({jobId,success:false,error:{code}})+'\n');else ending=true;}
  finally{busy=false;if(ending)await shutdown();}
 }
 try{
  if(!apiRoot||path.resolve(process.cwd()).toLowerCase()!==path.resolve(apiRoot).toLowerCase()||process.env.SQL_READ_ONLY!=='true')throw Error('EXACT_NORMAL_API_CWD_REQUIRED');
  module=await import(pathToFileURL(apiRoot+'/src/config/vegaDatabase.js'));driver=(await import(pathToFileURL(apiRoot+'/node_modules/mssql/tedious.js'))).default;
  scopeHash=signature();
  process.stdin.on('data',chunk=>{
   if(ending||closed)return;buffer=Buffer.concat([buffer,Buffer.from(chunk)]);const newline=buffer.indexOf(10);
   if(newline<0){if(buffer.length>65536){ending=true;if(!busy)void shutdown();}return;}
   if(newline>65536||newline!==buffer.length-1){ending=true;if(!busy)void shutdown();return;}
   const line=buffer.subarray(0,newline).toString('utf8');buffer=Buffer.alloc(0);void consume(line);
  });
  process.stdin.on('end',()=>{ending=true;if(!busy)void shutdown();});
  process.stdin.on('error',()=>{ending=true;if(!busy)void shutdown();});
  process.stdout.on('error',()=>{ending=true;if(!busy)void shutdown();});
 }catch{await shutdown();}
}
if(process.argv[1]&&path.resolve(process.argv[1]).toLowerCase()===fileURLToPath(import.meta.url).toLowerCase()&&process.argv.includes('--runtime-persistent-read'))await runPersistent();
