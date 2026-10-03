// Full mutation-free preflight, shared verbatim by real Apply and DEV dryrun.
import {readFile,writeFile,readdir,stat,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {runDevProcess,devProcessSucceeded} from './run-dev-process.mjs';
import {verifyLockedDependencies} from './verify-locked-dependencies.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dep=path.join(root,'deployment-dependency');
const node='C:\\Program Files\\nodejs\\node.exe',ps5='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const guard=pathToFileURL(path.join(dep,'offline-test-guard.mjs')).href;
const receiptRoot=path.join(root,'full-preflight-evidence',new Date().toISOString().replace(/[-:.]/g,''));
await mkdir(receiptRoot,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function files(dir,predicate,out=[]){
 for(const item of await readdir(dir,{withFileTypes:true})){
  if(item.isSymbolicLink())throw Error('PREFLIGHT_REPARSE_REJECTED');
  const p=path.join(dir,item.name);
  if(item.isDirectory())await files(p,predicate,out);else if(predicate(p))out.push(p);
 }return out.sort();
}
async function noSecretFiles(dir){
 // Existence/names only: never read environment file contents, including
 // Vite's mode-local files such as .env.production.local.
 for(const name of await readdir(dir)){
  if(/^\.env(?:\.|$)/i.test(name)||name==='.npmrc'||/\.env(?:\.|$)/i.test(name))throw Error('OFFLINE_SECRET_FILE_PRESENT');
 }
}
const stages=[];
let failedStage=null,testsPassed=0,frontendIndexBefore=null,frontendIndexAfter=null;
async function run(stage,cwd,args,count,{ps=false,mode='test'}={}){
 const r=await runDevProcess({stage,executable:ps?ps5:node,args,cwd,receiptRoot,nodeEnv:mode});
 const output=r.stdout+r.stderr;
 const actual=ps?(output.match(/^PASS /gm)||[]).length:Number(output.match(/^# pass (\d+)\s*$/m)?.[1]||0);
 const pass=devProcessSucceeded(r) && actual===count && (ps||new RegExp('^# fail 0\\s*$','m').test(output));
 stages.push({...r,stdout:undefined,stderr:undefined,expectedTests:count,actualTests:actual,passed:pass});
 if(!pass){failedStage=stage;throw Error('FULL_OFFLINE_STAGE_FAILED')}
 testsPassed+=actual;
 console.log(JSON.stringify({stage,status:'PASS',tests:actual,cwd}));
}
try{
 const dependencyProof=await verifyLockedDependencies(root);
 stages.push({stage:'locked-dependencies',passed:true,projects:dependencyProof});
 for(const project of ['gateway','frontend'])await noSecretFiles(path.join(dep,project));
 await run('offline-guard-4',root,['--test','--test-reporter=tap',path.join(root,'offline-guard.test.mjs')],4);
 for(const [stage,file,count] of [
  ['single-entry-flow','orchestrator-offline.test.ps1',62],
  ['single-entry-recovery','entrypoint-composition-offline.test.ps1',19],
  ['native-recovery-inventory','recovery-inventory-offline.test.ps1',14],
  ['mutation-commit','mutation-commit-fixture.test.ps1',4]]){
  await run(stage,root,['-NoProfile','-NonInteractive','-File',path.join(root,file)],count,{ps:true});
 }
 for(const [stage,file,count] of [
  ['ps5-launch','roleSeparatedLaunchFixture.test.ps1',34],
  ['ps5-transaction','roleSeparatedControllerFlowFixture.test.ps1',14],
  ['ps5-denial','roleSeparatedFaultFixture.test.ps1',11],
  ['ps5-native-time','nativeTimePrecisionFixture.test.ps1',11]]){
  await run(stage,path.join(dep,'controlled-install'),['-NoProfile','-NonInteractive','-File',path.join(dep,'controlled-install',file)],count,{ps:true});
 }
 const gateway=path.join(dep,'gateway');
 await run('gateway-209',gateway,['--import',guard,'--test','--test-reporter=tap',...await files(path.join(gateway,'src'),p=>p.endsWith('.test.js'))],209);
 const source=path.join(dep,'controlled-install');
 await run('source-38',source,['--import',guard,'--test','--test-reporter=tap',
  ...['crmExistingStockReadWorker.test.mjs','runExistingStockWorker.test.mjs','firstPageAdapter.test.mjs','catalogReadBudgetCandidate.test.mjs'].map(f=>path.join(source,f))],38);
 const front=path.join(dep,'frontend');
 const frontTests=[...await files(path.join(front,'tests'),p=>/\.test\.(?:mjs|js)$/.test(p)),
  ...await files(path.join(front,'src'),p=>/\.test\.(?:mjs|js)$/.test(p))];
 await run('frontend-230',front,['--import',guard,'--test','--test-reporter=tap',...frontTests],230);
 frontendIndexBefore=sha(await readFile(path.join(front,'dist','client','index.html')));
 const build=await runDevProcess({stage:'frontend-vite-build',executable:node,
  args:['--import',guard,path.join(front,'node_modules','vite','bin','vite.js'),'build'],
  cwd:front,receiptRoot,nodeEnv:'production'});
 stages.push({...build,stdout:undefined,stderr:undefined,passed:devProcessSucceeded(build)});
 if(!stages.at(-1).passed){failedStage='frontend-vite-build';throw Error('FULL_OFFLINE_STAGE_FAILED')}
 const prepare=await runDevProcess({stage:'frontend-prepare-assets',executable:node,
  args:['--import',guard,path.join(front,'scripts','prepare-sites-build.mjs')],cwd:front,receiptRoot,nodeEnv:'production'});
 stages.push({...prepare,stdout:undefined,stderr:undefined,passed:devProcessSucceeded(prepare)});
 if(!stages.at(-1).passed){failedStage='frontend-prepare-assets';throw Error('FULL_OFFLINE_STAGE_FAILED')}
 frontendIndexAfter=sha(await readFile(path.join(front,'dist','client','index.html')));
 if(frontendIndexAfter!==frontendIndexBefore){failedStage='frontend-index-pin';throw Error('FRONTEND_BUILD_INDEX_DRIFT')}
 // Every compiled same-origin index asset must exist under its exact dist root.
 const html=await readFile(path.join(front,'dist','client','index.html'),'utf8');
 const refs=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m=>m[1]);
 if(refs.length<2)throw Error('COMPILED_ASSET_REFERENCES_REQUIRED');
 for(const ref of refs){
  const p=path.resolve(front,'dist','client','.'+ref);
  if(!p.startsWith(path.join(front,'dist','client')+path.sep))throw Error('ASSET_PATH_OUTSIDE_DIST');
  if((await stat(p)).size===0)throw Error('EMPTY_COMPILED_ASSET');
 }
 const worker=await readFile(path.join(front,'dist','server','index.js'));
 if(sha(worker)!==sha(await readFile(path.join(front,'worker','index.js'))))throw Error('PREPARED_WORKER_BYTES_DIFFER');
 stages.push({stage:'frontend-assets',passed:true,references:refs.length,indexSha256:frontendIndexAfter});
 const receipt={status:'PASS',testsPassed,stages,frontendIndexBefore,frontendIndexAfter,receiptRoot,
  dependencyRoot:dep,actualModuleResolution:true,originalTestCopyUsed:false,
  productionRuntimeActions:0,networkRequestsToServices:0,sqlExecuted:false,authPost:false,providerCalls:0};
 await writeFile(path.join(receiptRoot,'PREFLIGHT_RESULT.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:'PASS',testsPassed,frontendAssets:'PASS',receiptRoot,productionRuntimeActions:0}));
}catch(error){
 const receipt={status:'FAIL',failedStage:failedStage||'setup',code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREFLIGHT_FAILED',
  testsPassed,stages,frontendIndexBefore,frontendIndexAfter,receiptRoot,
  dependencyRoot:dep,productionRuntimeActions:0,sqlExecuted:false,authPost:false,providerCalls:0};
 await writeFile(path.join(receiptRoot,'PREFLIGHT_RESULT.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
 console.log(JSON.stringify({status:'FAIL',failedStage:receipt.failedStage,code:receipt.code,receiptRoot,productionRuntimeActions:0}));
 process.exitCode=1;
}
