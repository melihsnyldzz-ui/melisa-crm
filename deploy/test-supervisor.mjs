import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyTestPackage} from './test-package.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
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
  const children=new Map(),startedAt=new Date().toISOString();let stopping=false;
  function persist(){
    const identity={supervisor:process.pid,root,executable:process.execPath,startedAt,updatedAt:new Date().toISOString(),stopping,runtime,logs,ports,children:Object.fromEntries([...children].map(([name,p])=>[name,p.pid]))};
    const temporary=path.join(runtime,'processes.json.tmp');
    fs.writeFileSync(temporary,JSON.stringify(identity,null,2));fs.renameSync(temporary,path.join(runtime,'processes.json'));
  }
  function start(file){
    if(stopping)return;
    // A finalized package is never rebuilt in place. Recheck before every child recovery.
    assertTestExecutionPackage(root);
    const log=fs.openSync(path.join(logs,file+'.log'),'a');
    const child=spawn(process.execPath,[path.join(root,'deploy',file)],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore',log,log]});
    fs.closeSync(log);children.set(file,child);persist();
    child.once('error',error=>{console.error('TEST_CHILD_START_FAILED',file,error.code);});
    child.once('close',()=>{children.delete(file);persist();if(!stopping)setTimeout(()=>{try{start(file)}catch(error){console.error('TEST_PACKAGE_RECOVERY_REJECTED',error.code||error.message);stop()}},3000);});
  }
  for(const file of ['test-erp-catalog.mjs','test-erp-orders.mjs','test-server.mjs'])start(file);
  function stop(){stopping=true;persist();for(const child of children.values())child.kill();setTimeout(()=>process.exit(0),1000).unref();}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await startTestSupervisor();
