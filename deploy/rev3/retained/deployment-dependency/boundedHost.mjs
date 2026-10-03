import {spawn} from 'node:child_process';
export function isPermissionDenial(error){
 const seen=new Set();let current=error;
 for(let i=0;i<8&&current&&!seen.has(current);i++){
  seen.add(current);
  if(current.permissionDenied===true||['EACCES','EPERM','AccessDenied','HOST_PERMISSION_DENIED_STOP'].includes(current.code)||
   ['UnauthorizedAccessException','SecurityError','UnauthorizedAccess'].includes(current.name)||
   [current.errno,current.nativeErrorCode,current.NativeErrorCode,current.win32Code].some(v=>Number(v)===10013))return true;
  current=current.cause||current.innerException||current.InnerException;
 }return false;
}
const failure=(code,extra={})=>Object.assign(Error(code),{code,...extra});
export function runBoundedHost({command,args,spawnProcess=spawn,timeoutMs=10000,terminationMs=2000,schedule=setTimeout,unschedule=clearTimeout}={}){
 return new Promise((resolve,reject)=>{
  let child;try{child=spawnProcess(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']})}catch(error){return reject(failure('HOST_SPAWN_FAILED_STOP',{permissionDenied:isPermissionDenial(error)}))}
  let output='',stderr='',settled=false,stopping=false,pending=null,termination;
  const finish=(error,value)=>{if(settled)return;settled=true;unschedule(timer);unschedule(termination);error?reject(error):resolve(value)};
  const stop=error=>{
   if(stopping||settled)return;stopping=true;pending=error;unschedule(timer);
   // Close confirmation precedes resolution. Missing confirmation blocks all runtime recovery.
   termination=schedule(()=>finish(failure('HOST_CHILD_EXIT_UNCONFIRMED_NO_RECOVERY',{operationUncertain:true,permissionDenied:error.permissionDenied===true})),terminationMs);
   try{child.kill()}catch{};
  };
  const timer=schedule(()=>stop(failure('HOST_HELPER_TIMEOUT_STOP',{operationUncertain:true})),timeoutMs);
  child.stdout.on('data',b=>{if(settled||stopping)return;output+=b;if(Buffer.byteLength(output)>16384)stop(failure('HOST_HELPER_OUTPUT_LIMIT_STOP',{operationUncertain:true}))});
  child.stderr.on('data',b=>{if(settled||stopping)return;stderr+=b;if(Buffer.byteLength(stderr)>16384)stop(failure('HOST_HELPER_OUTPUT_LIMIT_STOP',{operationUncertain:true}))});
  child.on('error',error=>stop(failure('HOST_EXECUTION_FAILED_STOP',{permissionDenied:isPermissionDenial(error),operationUncertain:true})));
  child.on('close',code=>{
   if(settled)return;if(stopping)return finish(pending);
   try{
    const r=JSON.parse(output);if(code!==0||r.success!==true)throw failure(r.code||'HOST_EXECUTION_FAILED_STOP',{permissionDenied:r.permissionDenied===true});
    finish(null,r.result);
   }catch(error){
    // Classify only known script/OS denial markers; never expose stderr, command args or error details.
    const denied=isPermissionDenial(error)||/SecurityError|UnauthorizedAccess|Access is denied|10013/.test(stderr);
    finish(failure(denied?'HOST_PERMISSION_DENIED_STOP':'HOST_EXECUTION_FAILED_STOP',{permissionDenied:denied,operationUncertain:!denied}));
   }
  });
 });
}
