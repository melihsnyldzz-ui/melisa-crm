// Fixed local DEV process runner. Never used by production application code.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
export function devProcessSucceeded(r){
 return r.exitCode===0&&!r.spawnError&&!r.timedOut&&!r.outputExceeded&&!r.stopRequested&&
  r.terminationConfirmed===true&&r.childTreeQuiescence==='NORMAL_EXIT';
}
export async function runDevProcess({stage, executable, args, cwd, receiptRoot, timeoutMs=120000, nodeEnv='test',spawnDev=spawn,outputLimit=2097152,stopGraceMs=1000}) {
 if(!['test','production','development'].includes(nodeEnv))throw Error('FIXED_DEV_ENVIRONMENT_REQUIRED');
 const root=path.resolve(receiptRoot);
 await mkdir(root,{recursive:true});
 const env={
  SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',
  PATH:'C:\\Program Files\\nodejs;C:\\Windows\\System32;C:\\Windows',
  TEMP:'C:\\Users\\Xaser\\AppData\\Local\\Temp',TMP:'C:\\Users\\Xaser\\AppData\\Local\\Temp',
  NODE_ENV:nodeEnv,NO_COLOR:'1'
 };
 const startedAt=new Date().toISOString();
 if(!/^[a-z0-9-]+$/.test(stage)||outputLimit<1||outputLimit>2097152||stopGraceMs<1||stopGraceMs>2000)throw Error('BOUNDED_DEV_RUN_REQUIRED');
 const child=spawnDev(executable,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',spawnError=null,timedOut=false,outputExceeded=false;
 let stopRequested=false,stopAccepted=null,stopError=null,terminationConfirmed=false,resolveClose,grace;
 const closed=new Promise(resolve=>{resolveClose=resolve});
 function stopOnce(){
  if(stopRequested||terminationConfirmed)return;
  stopRequested=true;
  try{stopAccepted=child.kill()}catch(error){stopError={code:error.code||'STOP_ERROR',type:error.name}}
  grace=setTimeout(()=>{
   if(terminationConfirmed)return;
   child.stdout?.destroy?.();child.stderr?.destroy?.();child.unref?.();
   resolveClose({exitCode:null,signal:null});
  },stopGraceMs);
 }
 function capture(key,b){
  const text=b.toString('utf8'),current=key==='stdout'?stdout:stderr;
  const remaining=Math.max(0,outputLimit-Buffer.byteLength(current));
  const part=Buffer.from(text).subarray(0,remaining).toString('utf8');
  if(key==='stdout')stdout+=part;else stderr+=part;
  if(Buffer.byteLength(text)>remaining){outputExceeded=true;stopOnce()}
 }
 child.stdout?.on('data',b=>capture('stdout',b));
 child.stderr?.on('data',b=>capture('stderr',b));
 child.once('error',error=>{spawnError={code:error.code||'SPAWN_ERROR',type:error.name}});
 child.once('close',(exitCode,signal)=>{
  terminationConfirmed=true;clearTimeout(grace);resolveClose({exitCode,signal});
 });
 const timer=setTimeout(()=>{timedOut=true;stopOnce()},timeoutMs);
 const {exitCode,signal}=await closed;
 clearTimeout(timer);
 const prefix=path.join(root,stage);
 await writeFile(prefix+'.stdout.txt',stdout,{flag:'wx'});
 await writeFile(prefix+'.stderr.txt',stderr,{flag:'wx'});
 const sha=s=>createHash('sha256').update(s).digest('hex');
 const receipt={stage,executable,args,cwd,startedAt,finishedAt:new Date().toISOString(),
  exitCode,signal,timedOut,spawnError,outputExceeded,outputLimit,stopRequested,stopAccepted,stopError,
  terminationConfirmed,childTreeQuiescence:stopRequested?'NOT_VERIFIED_NO_RETRY':'NORMAL_EXIT',
  stdoutFile:stage+'.stdout.txt',stderrFile:stage+'.stderr.txt',
  stdoutSha256:sha(stdout),stderrSha256:sha(stderr),stdoutBytes:Buffer.byteLength(stdout),
  stderrBytes:Buffer.byteLength(stderr),environment:'fixed nonsecret DEV values only; parent values not copied',
  productionRuntimeActions:0,authPost:false,sqlExecuted:false,providerCalls:0};
 await writeFile(prefix+'.receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});
 return {...receipt,stdout,stderr};
}
