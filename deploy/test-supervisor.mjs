import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyTestPackage} from './test-package.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function recoveryDecision(failures,stableMs=0){
  const count=stableMs>=120000?0:failures;
  return count>=5?{state:'circuit-open',failures:count,delayMs:0}:{state:'restart-wait',failures:count+1,delayMs:Math.min(60000,5000*2**count)};
}
export async function probeTestDependencies({fetchImpl=fetch,chatwootUrl,chatwootToken,expectedDatabase='MELISA_ERP_SIRKET_TEST_20260929_01',nativeSourceCommit,nativePackageId}={}){
  const probe=async(url,headers,validate)=>{
    try{const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(2500),redirect:'error'});if(!response.ok)return {state:'unavailable'};const body=await response.json();return {state:validate(body)?'ready':'identity-mismatch'};}catch{return {state:'unavailable'};}
  };
  let chatwoot={state:'unconfigured'};
  if(chatwootUrl&&chatwootToken){
    try{const url=new URL(chatwootUrl);
      if(url.origin==='http://127.0.0.1:3100')chatwoot=await probe(url.origin+'/api/v1/profile',{'api_access_token':chatwootToken},body=>Number.isInteger(body.id)&&body.id>0);
      else chatwoot={state:'identity-mismatch'};
    }catch{chatwoot={state:'identity-mismatch'};}
  }
  const [erp,native]=await Promise.all([
    probe('http://127.0.0.1:4144/test-health',{},body=>body.ok&&body.environment==='CANONICAL_TEST'&&body.port===4144&&body.databaseName===expectedDatabase),
    probe('http://127.0.0.1:62404/test-health',{},body=>body.ok&&body.environment==='CANONICAL_TEST'&&body.port===62404&&body.database===expectedDatabase&&body.purpose==='crm-order-draft-only'&&body.stockEffect===false&&body.ledgerEffect===false&&body.sourceCommit===nativeSourceCommit&&body.packageId===nativePackageId),
  ]);
  return {chatwoot,erp,native};
}
export function assertTestExecutionPackage(executionRoot,env=process.env,verify=verifyTestPackage){
  const packageRoot=env.CRM_TEST_PACKAGE_ROOT||'',pin=(env.CRM_TEST_PACKAGE_MANIFEST_SHA256||'').toLowerCase();
  if(!packageRoot&&!pin)return;
  if(!packageRoot||!pin||!/^[a-f0-9]{64}$/.test(pin))throw Error('TEST_PACKAGE_ENVIRONMENT_PAIR_REQUIRED');
  const normalized=path.resolve(packageRoot),actual=path.resolve(executionRoot);
  if((process.platform==='win32'?normalized.toLowerCase()!==actual.toLowerCase():normalized!==actual))throw Error('TEST_PACKAGE_EXECUTION_ROOT_MISMATCH');
  return verify({packageRoot:normalized,manifestSha256:pin});
}
export function resolveTestDirectories(repoRoot,env=process.env){
  const checkout=path.resolve(repoRoot),parent=path.dirname(checkout);
  const runtime=path.resolve(env.CRM_TEST_RUNTIME_DIR||path.join(parent,'runtime','test-completion'));
  const logs=path.resolve(env.CRM_TEST_LOG_DIR||path.join(parent,'logs','test-completion'));
  for(const directory of [runtime,logs]){
    const relative=path.relative(checkout,directory);
    if(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)))throw Error('TEST_STATE_MUST_BE_OUTSIDE_CHECKOUT');
  }
  return {runtime,logs};
}

export async function startTestSupervisor(){
  for(const name of ['CRM_BASELINE_ENV','CRM_ERP_CATALOG_ACCESS_PATH'])if(!process.env[name]||!fs.existsSync(process.env[name]))throw Error(name+'_REQUIRED');
  if(!path.isAbsolute(process.env.CRM_ERP_CATALOG_ACCESS_PATH)||!path.relative(root,path.resolve(process.env.CRM_ERP_CATALOG_ACCESS_PATH)).startsWith('..'))throw Error('TEST_CATALOG_ACCESS_MUST_BE_PRIVATE');
  const ports=[62400,62401,62402,62403];
  for(const port of ports)await new Promise((resolve,reject)=>{
    const socket=net.connect(port,'127.0.0.1');
    socket.once('connect',()=>{socket.destroy();reject(Error('TEST_PORT_IN_USE_'+port));});
    socket.once('error',resolve);
  });
  const {runtime,logs}=resolveTestDirectories(root);
  fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(logs,{recursive:true});
  const children=new Map(),startedAt=new Date().toISOString(),serviceStates=new Map();let stopping=false,dependencyBusy=false;
  const {default:dotenv}=await import('../apps/gateway/node_modules/dotenv/lib/main.js');
  const baseline=dotenv.parse(fs.readFileSync(process.env.CRM_BASELINE_ENV));
  let dependencies={chatwoot:{state:'checking'},erp:{state:'checking'},native:{state:'checking'}};
  const atomic=(file,value)=>{const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);};
  function persist(){
    const identity={supervisor:process.pid,root,executable:process.execPath,startedAt,updatedAt:new Date().toISOString(),stopping,runtime,logs,ports,children:Object.fromEntries([...children].map(([name,p])=>[name,p.pid]))};
    const temporary=path.join(runtime,'processes.json.tmp');
    fs.writeFileSync(temporary,JSON.stringify(identity,null,2));fs.renameSync(temporary,path.join(runtime,'processes.json'));
    const names={'test-server.mjs':'server','test-erp-catalog.mjs':'catalog','test-erp-orders.mjs':'orders'};
    const services=Object.fromEntries([...serviceStates].map(([file,state])=>[names[file],{pid:children.get(file)?.pid||0,state:state.state,restartCount:state.restartCount,lastCode:state.lastCode||null,nextRestartAt:state.nextRestartAt||null}]));
    const ready=[...serviceStates.values()].every(state=>state.state==='running')&&Object.values(dependencies).every(value=>value.state==='ready');
    atomic(path.join(runtime,'health-status.json'),{version:1,environment:'CANONICAL_TEST',observedAt:new Date().toISOString(),sourceCommit:process.env.CRM_TEST_SOURCE_COMMIT||null,packageId:process.env.CRM_TEST_SOURCE_COMMIT?'crm-test-'+process.env.CRM_TEST_SOURCE_COMMIT:null,packageManifestSha256:process.env.CRM_TEST_PACKAGE_MANIFEST_SHA256||null,startup:{taskName:'Melisa-CRM-TEST-Completion',configured:process.env.CRM_TEST_AUTOSTART_CONFIGURED==='true',supervisorPid:process.pid,state:stopping?'stopping':ready?'running':'degraded'},services,dependencies});
  }
  async function dependenciesTick(){
    if(stopping||dependencyBusy)return;dependencyBusy=true;
    try{dependencies=await probeTestDependencies({chatwootUrl:baseline.CHATWOOT_BASE_URL,chatwootToken:baseline.CHATWOOT_API_ACCESS_TOKEN,nativeSourceCommit:process.env.CRM_TEST_NATIVE_SOURCE_COMMIT,nativePackageId:process.env.CRM_TEST_NATIVE_PACKAGE_ID});persist();}finally{dependencyBusy=false;}
  }
  function start(file){
    if(stopping)return;
    const state=serviceStates.get(file)||{failures:0,restartCount:0,state:'starting',lastCode:null};serviceStates.set(file,state);
    // A finalized package is never rebuilt in place. Recheck before every child recovery.
    assertTestExecutionPackage(root);
    const log=fs.openSync(path.join(logs,file+'.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'deploy',file)],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore',log,log]});
    fs.closeSync(log);children.set(file,child);state.startedAt=Date.now();state.state='running';state.nextRestartAt=null;state.restartCount++;persist();
    child.once('error',()=>{state.lastCode='TEST_CHILD_START_FAILED';console.error('TEST_CHILD_START_FAILED',file);});
    child.once('close',()=>{
      children.delete(file);if(stopping){persist();return;}
      const decision=recoveryDecision(state.failures,Date.now()-state.startedAt);Object.assign(state,decision,{lastCode:'TEST_CHILD_EXITED',nextRestartAt:decision.delayMs?new Date(Date.now()+decision.delayMs).toISOString():null});persist();
      console.error(decision.state==='circuit-open'?'TEST_CHILD_RECOVERY_LIMIT':'TEST_CHILD_RESTART_WAIT',file);
      if(decision.state==='circuit-open')return;
      setTimeout(async()=>{
        if(stopping)return;
        try{
          const occupied=await servicePortOccupied(file);
          if(occupied){state.state='circuit-open';state.lastCode='TEST_FOREIGN_PORT_OCCUPIED';persist();return;}
          start(file);
        }catch{state.state='circuit-open';state.lastCode='TEST_PACKAGE_RECOVERY_REJECTED';console.error('TEST_PACKAGE_RECOVERY_REJECTED',file);persist();}
      },decision.delayMs);
    });
  }
  for(const file of ['test-erp-catalog.mjs','test-erp-orders.mjs','test-server.mjs'])start(file);
  const dependencyTimer=setInterval(()=>{void dependenciesTick()},15000);void dependenciesTick();
  function stop(){stopping=true;clearInterval(dependencyTimer);persist();for(const child of children.values())child.kill();setTimeout(()=>process.exit(0),1000).unref();}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
async function servicePortOccupied(file){
  const ports=file==='test-server.mjs'?[62400,62401]:file==='test-erp-catalog.mjs'?[62402]:[62403];
  for(const port of ports){const occupied=await new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(true)});});if(occupied)return true;}
  return false;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await startTestSupervisor();
