// Authorized fixed existing-stock SELECT profiler; all raw results remain in pipe/memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const script=fileURLToPath(import.meta.url),repo=path.resolve(path.dirname(script),'..');
const release='C:/Sirket/CRM/releases/crm-test-f1899b0e0828f23010af75b1731682c749e596cc';
const apiRoot='C:/Sirket/ERP/releases/CANONICAL-LINKED-RETURN-TEST-20261003-05/apps/api';
const reportName=process.argv.includes('--pool-candidate')?'pool-compare.json':process.argv.includes('--warm-isolated')?'warm-isolated.json':process.argv.includes('--statistics-time')?'statistics-time.json':process.argv.includes('--statement-split')?'statement-split.json':process.argv.includes('--stream-phases')?'statement-phases.json':process.argv.includes('--candidate-probe')?'candidate-probe.json':process.argv.includes('--compare-candidate')?'candidate-compare.json':'before-profile.json';
const round=n=>Math.round(n*100)/100;
const safe=error=>/^[A-Z0-9_]{1,80}$/.test(error?.message||'')?error.message:'PROFILE_READ_FAILED';
if(process.argv.includes('--compatibility')||process.argv.includes('--stock-key-metadata')){
 let database;const summary={measuredAt:new Date().toISOString()};
 try{const config=JSON.parse(await fs.readFile('C:/Sirket/CRM/runtime/test-completion/startup-config.json','utf8'));if(path.resolve(config.PackageRoot).toLowerCase()!==path.resolve(release).toLowerCase())throw Error('PROFILE_PACKAGE_IDENTITY_MISMATCH');process.chdir(apiRoot);process.env.CRM_ERP_BASELINE_ENV=config.ErpBaselineEnv;await (await import(pathToFileURL(release+'/deploy/test-erp-read-environment.mjs'))).loadTestErpReadEnvironment();process.env.SQL_READ_ONLY='true';database=await import(pathToFileURL(apiRoot+'/src/config/vegaDatabase.js'));const pool=await database.getVegaSqlPool();const metadata=process.argv.includes('--stock-key-metadata');const sql=metadata?"SELECT DB_NAME() AS databaseName,t.name AS dataType,MAX(CASE WHEN ic.key_ordinal=1 AND i.is_disabled=0 THEN 1 ELSE 0 END) AS leadingIndex,MAX(CASE WHEN ic.key_ordinal=1 AND i.is_primary_key=1 THEN 1 ELSE 0 END) AS primaryKey FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id LEFT JOIN sys.index_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id LEFT JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE c.object_id=OBJECT_ID(N'dbo.F0102TBLSTOKLAR') AND c.name=N'IND' GROUP BY t.name;":"SELECT DB_NAME() AS databaseName,compatibility_level FROM sys.databases WHERE name=DB_NAME();";const result=await pool.request().query("IF DB_NAME()<>N'VEGA2026' THROW 51000,N'ERP_PRODUCT_SOURCE_IDENTITY_REQUIRED',1; "+sql);const row=result.recordset?.[0];summary.productDatabaseVerified=row?.databaseName==='VEGA2026';if(metadata){summary.dataType=['int','bigint'].includes(row?.dataType)?row.dataType:'other';summary.leadingIndex=row?.leadingIndex===1;summary.primaryKey=row?.primaryKey===1;}else summary.compatibilityLevel=Number.isInteger(row?.compatibility_level)?row.compatibility_level:null;}catch(error){summary.errorCode=safe(error);}finally{await database?.closeVegaSqlPool?.();await fs.writeFile(path.join(repo,'docs/evidence/crm/performance-2026-10-05/'+(process.argv.includes('--stock-key-metadata')?'stock-key-metadata.json':'sql-compatibility.json')),JSON.stringify(summary,null,2)+'\n');}console.log(JSON.stringify(summary));process.exit(0);
}
function wrappedPool(pool,stats,label){return {request(){const request=pool.request(),inputs=[];let inputMs=0,count=0;return {input(...args){inputs.push(args);const t=performance.now();request.input(...args);inputMs+=performance.now()-t;count++;return this;},cancel(){return request.cancel?.();},async query(sql){stats[label+'ParameterCount']=count;stats[label+'SqlLength']=sql.length;stats[label+'BindMs']=round(inputMs);const t=performance.now();try{
 if(label==='stock'&&process.env.CRM_PERF_STATISTICS_TIME==='true'){
  stats.serverTimes=[];request.on('info',info=>{const message=info?.message||'';const numbers=/CPU time\s*=\s*(\d+)\s*ms,\s*elapsed time\s*=\s*(\d+)\s*ms/i.exec(message);if(numbers&&(message.includes('parse and compile time')||message.includes('Execution Times')))stats.serverTimes.push({kind:message.includes('parse and compile time')?'compile':'execution',cpuMs:Number(numbers[1]),elapsedMs:Number(numbers[2])});});
  return await request.query('SET STATISTICS TIME ON;'+sql);
 }
 if(label==='stock'&&process.env.CRM_PERF_STATEMENT_SPLIT==='true'){
  const parts=sql.split(';').map(part=>part.trim()).filter(Boolean);if(parts.length!==7)throw Error('PROFILE_FIXED_BATCH_SHAPE_REQUIRED');const recordsets=[];stats.statementMs=[];
  for(let index=2;index<=5;index++){const fixed=pool.request();for(const input of inputs)fixed.input(...input);const started=performance.now();const result=await fixed.query(parts[0]+';'+parts[1]+';'+parts[index]+';'+parts[6]+';');stats.statementMs.push(round(performance.now()-started));if(result.recordsets?.length!==3||result.recordsets[0]?.[0]?.databaseName!=='VEGA2026'||result.recordsets[2]?.[0]?.databaseName!=='VEGA2026')throw Error('ERP_PRODUCT_SOURCE_IDENTITY_REQUIRED');if(index===2)recordsets.push(result.recordsets[0]);recordsets.push(result.recordsets[1]);if(index===5)recordsets.push(result.recordsets[2]);}
  return {recordsets,recordset:recordsets[0]};
 }
 if(label==='stock'&&process.env.CRM_PERF_STREAM_PHASES==='true'){
  request.stream=true;const recordsets=[];let current;const arrivals=[];let streamError;
  request.on('error',error=>{streamError=error;});request.on('recordset',()=>{current=[];recordsets.push(current);arrivals.push(round(performance.now()-t));});request.on('row',row=>current.push(row));
  const result=await request.query(sql);if(streamError)throw streamError;stats.recordsetArrivalMs=arrivals;stats.recordsetCounts=recordsets.map(set=>set.length);return {...result,recordsets,recordset:recordsets[0]};
 }
 return await request.query(sql);
 }finally{stats[label+'QueryMs']=round(performance.now()-t);stats[label+'QueryEndedAt']=performance.now();}}};}};}
if(process.argv.includes('--profile-worker')){
 let module;const stats={};let start=performance.now(),queryEnded=0;
 try{
  if(path.resolve(process.cwd()).toLowerCase()!==path.resolve(apiRoot).toLowerCase()||process.env.SQL_READ_ONLY!=='true')throw Error('PROFILE_SCOPE_INVALID');
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>65536)throw Error('WORKER_INPUT_LIMIT');}
  const {options,eligibleIds}=JSON.parse(input);let t=performance.now();
  const workerRoot=process.env.CRM_PERF_WORKER_VARIANT==='candidate'?repo:release;
  const worker=await import(pathToFileURL(workerRoot+'/packages/erp-adapter/workers/crmExistingStockReadWorker.mjs'));stats.workerModuleImportMs=round(performance.now()-t);
  t=performance.now();module=await import(pathToFileURL(apiRoot+'/src/config/vegaDatabase.js'));stats.databaseModuleImportMs=round(performance.now()-t);
  t=performance.now();const driver=(await import(pathToFileURL(apiRoot+'/node_modules/mssql/tedious.js'))).default;stats.driverImportMs=round(performance.now()-t);
  const warm=process.env.CRM_PERF_WARM_ISOLATED==='true';let data,firstDigest;if(warm)stats.warmSamples=[];
  for(let index=0;index<(warm?3:1);index++){
   const phase=warm?{index:index+1}:stats,executionStart=performance.now();
   data=await worker.executeRead({options,eligibleIds,driver,getPool:async()=>{phase.planUntilPoolMs=round(performance.now()-executionStart);const p=performance.now();const pool=await module.getVegaSqlPool();phase.connectMs=round(performance.now()-p);return wrappedPool(pool,phase,'stock');}});
   queryEnded=phase.stockQueryEndedAt;delete phase.stockQueryEndedAt;phase.projectValidateMs=round(performance.now()-queryEnded);phase.executeReadMs=round(performance.now()-executionStart);
   if(warm){const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');if(index===0)firstDigest=digest;phase.fullReadEqualToFirst=digest===firstDigest;stats.warmSamples.push(phase);}
  }
  stats.totalBeforeCleanupMs=round(performance.now()-start);
  process.stdout.write(JSON.stringify({success:true,data,profile:stats})+'\n');
 }catch(error){stats.errorCode=safe(error);if(Number.isInteger(error?.number))stats.sqlErrorNumber=error.number;if(/^[A-Z0-9_]{1,40}$/.test(error?.code||''))stats.driverErrorCode=error.code;process.stdout.write(JSON.stringify({success:false,error:{code:safe(error)},profile:stats})+'\n');}
 finally{if(module)try{await module.closeVegaSqlPool();}catch{}}
 process.exit(0);
}else{
 const report={measuredAt:new Date().toISOString(),runtimeSource:'f1899b0e0828f23010af75b1731682c749e596cc',scope:'existing-handler-fixed-SELECT-fresh-child',samples:[],limitations:['No server execution plan; SQL batch timing includes server compile/execute/network.','Worker uses exact executeRead in a fresh profiler child through original runner spawn dependency.','planUntilPool includes only exact executeRead plan construction; projection is post-query residual.']};
 if(process.argv.includes('--pool-candidate')){report.scope='existing-handler-fresh-guarded-SELECT-bounded-pool';report.limitations=['Baseline uses exact f189 worker in fresh child; candidate uses canonical bounded pool.','Fresh auth and DB identity proof preserved for every request; only connection/process is reused.','Equality excludes only request fetch timestamp; hashes and bodies stay in memory.'];}
 let token,persistentPool;
 try{
  const config=JSON.parse(await fs.readFile('C:/Sirket/CRM/runtime/test-completion/startup-config.json','utf8'));
  if(path.resolve(config.PackageRoot).toLowerCase()!==path.resolve(release).toLowerCase())throw Error('PROFILE_PACKAGE_IDENTITY_MISMATCH');
  const envPath=config.ErpBaselineEnv;if(typeof envPath!=='string'||!envPath)throw Error('PROFILE_ENV_REQUIRED');
  process.env.CRM_ERP_API_ROOT=apiRoot;process.env.CRM_ERP_BASELINE_ENV=envPath;process.chdir(apiRoot);
  const env=await import(pathToFileURL(release+'/deploy/test-erp-read-environment.mjs'));await env.loadTestErpReadEnvironment();process.env.SQL_READ_ONLY='true';process.env.CRM_ERP_API_ROOT=apiRoot;
  const source=await import(pathToFileURL(release+'/packages/erp-adapter/services/crmCatalogReadSource.mjs'));
  const database=await import(pathToFileURL(apiRoot+'/src/config/database.js'));
  const bootstrap=await fetch('http://127.0.0.1:62400/api/test-admin/session',{method:'POST',headers:{Origin:'http://127.0.0.1:62400'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});const body=await bootstrap.json();if(bootstrap.status!==200||typeof body.accessToken!=='string')throw Error('PROFILE_TEST_SESSION_REQUIRED');token=body.accessToken;
  if(process.argv.includes('--pool-candidate'))persistentPool=(await import(pathToFileURL(repo+'/packages/erp-adapter/services/crmStockWorkerPool.mjs'))).createCrmStockWorkerPool();
  const compare=process.argv.includes('--compare-candidate'),baselineHashes=new Map();let selectedId;if(process.argv.includes('--stream-phases'))process.env.CRM_PERF_STREAM_PHASES='true';if(process.argv.includes('--statement-split'))process.env.CRM_PERF_STATEMENT_SPLIT='true';if(process.argv.includes('--statistics-time'))process.env.CRM_PERF_STATISTICS_TIME='true';if(process.argv.includes('--warm-isolated'))process.env.CRM_PERF_WARM_ISOLATED='true';
  const scenarios=compare&&!process.argv.includes('--candidate-probe')&&!process.argv.includes('--first-page-only')?[['first-page','page=1&limit=12&hasImage=true&search=&brand=&category='],['code-41140','page=1&limit=12&hasImage=true&search=41140&brand=&category='],['name-supermini','page=1&limit=12&hasImage=true&search='+encodeURIComponent('SÜPERMİNİ')+'&brand=&category='],['second-page','page=2&limit=12&hasImage=true&search=&brand=&category='],['product-detail',null]]:[['first-page','page=1&limit=12&hasImage=true&search=&brand=&category=']];
  for(const [scenario,query]of scenarios)for(const variant of process.argv.includes('--candidate-probe')||process.argv.includes('--warm-isolated')?['candidate']:compare?['baseline','candidate']:['baseline'])for(let i=0;i<(process.argv.includes('--candidate-probe')||process.argv.includes('--warm-isolated')?1:3);i++){
   if(scenario==='product-detail'&&!selectedId)continue;
   const stats={index:i+1,scenario,variant,authMs:[]};let queryIndex=0;const started=performance.now();
   const handler=source.createCrmCatalogReadSource({activationApproved:true,crmOrigin:'http://127.0.0.1:62401',
    transport:async(...args)=>{const t=performance.now();try{return await fetch(...args);}finally{stats.authMs.push(round(performance.now()-t));}},
    getSqlDriver:database.getSqlDriver,getSqlPool:async()=>{const t=performance.now();const pool=await database.getSqlPool();stats.imagePoolMs=round(performance.now()-t);return {request(){return wrappedPool(pool,stats,++queryIndex===1?'identity':'images').request();}};},
    readExistingStock:async(options,eligibleIds,signal)=>{stats.eligibleIdCount=eligibleIds.length;const t=performance.now();if(persistentPool&&variant==='candidate'){const data=await persistentPool.read(options,eligibleIds,signal);stats.workerTotalMs=round(performance.now()-t);stats.workerPool=persistentPool.getState();return data;}let raw='';const data=await source.runExistingStockWorker(options,eligibleIds,signal,{spawnProcess:(executable,_argv,settings)=>{const child=spawn(executable,[script,'--profile-worker'],{...settings,env:{...process.env,CRM_PERF_WORKER_VARIANT:variant}});child.stdout.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>1024*1024)raw='';});child.on('close',()=>{try{stats.worker=JSON.parse(raw.trim()).profile;}catch{stats.workerProfileUnavailable=true;}});return child;}});stats.workerTotalMs=round(performance.now()-t);return data;}});
   const route=query?'?'+query:'/'+selectedId;
   const response=await handler(new Request('http://127.0.0.1:62402/api/crm-catalog/products'+route,{headers:{authorization:`Bearer ${token}`}}));const bytes=new Uint8Array(await response.arrayBuffer());stats.status=response.status;stats.bytes=bytes.length;stats.totalMs=round(performance.now()-started);let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{}if(Array.isArray(payload?.data)){stats.count=payload.data.length;if(!selectedId)selectedId=payload.data.find(row=>/^vega-[1-9]\d*$/.test(row?.id))?.id;}if(payload?.error?.code)stats.errorCode=safe({message:payload.error.code});
   if(compare&&response.status===200){delete payload.meta?.fetchedAt;const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');const key=scenario+':'+i;if(variant==='baseline')baselineHashes.set(key,digest);else stats.fullEnvelopeEqualExceptFetchTimestamp=baselineHashes.get(key)===digest;}
   delete stats.identityQueryEndedAt;delete stats.imagesQueryEndedAt;report.samples.push(stats);await fs.writeFile(path.join(repo,'docs/evidence/crm/performance-2026-10-05/'+reportName),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scenario,variant,index:i+1,status:stats.status,totalMs:stats.totalMs,sqlMs:stats.worker?.stockQueryMs,equal:stats.fullEnvelopeEqualExceptFetchTimestamp}));if(response.status===429)throw Error('PROFILE_RATE_LIMITED');
  }
  await database.closeSqlPool?.();
 }catch(error){report.errorCode=safe(error);}
 finally{token=undefined;if(persistentPool)report.workerShutdownConfirmed=await persistentPool.close();await fs.mkdir(path.join(repo,'docs/evidence/crm/performance-2026-10-05'),{recursive:true});await fs.writeFile(path.join(repo,'docs/evidence/crm/performance-2026-10-05/'+reportName),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({completedSamples:report.samples.length,errorCode:report.errorCode}));
}
