import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const worker=fileURLToPath(new URL('../workers/crmExistingStockReadWorker.mjs',import.meta.url));
const failure=code=>Error(code);
// Reuses driver connections only. Every job executes a fresh guarded SELECT batch.
export function createCrmStockWorkerPool({spawnProcess=spawn,size=2,maxQueued=32,deadlineMs=14000,idleMs=30000,terminationMs=1000,now=Date.now}={}){
 if(!Number.isSafeInteger(size)||size<1||size>2||!Number.isSafeInteger(maxQueued)||maxQueued<0||maxQueued>32||![deadlineMs,idleMs,terminationMs].every(Number.isSafeInteger)||deadlineMs<1||deadlineMs>14000||idleMs<1||idleMs>30000||terminationMs<1||terminationMs>1000)throw failure('WORKER_POOL_BOUNDS_REQUIRED');
 const signature=()=>createHash('sha256').update(JSON.stringify({cwd:path.resolve(process.cwd()).toLowerCase(),apiRoot:process.env.CRM_ERP_API_ROOT?path.resolve(process.env.CRM_ERP_API_ROOT).toLowerCase():null,env:Object.keys(process.env).filter(key=>/^(VEGA_|SQL_|CRM_ERP_)/.test(key)).sort().map(key=>[key,process.env[key]])})).digest('hex');
 const initialSignature=signature();
 const slots=new Set(),queue=[];let sequence=0,stopping=false,terminal=false,terminalCode='WORKER_TERMINATION_UNCONFIRMED',shutdownUnconfirmed=false;
 function configurationCurrent(){
  if(signature()===initialSignature)return true;
  terminal=true;stopping=true;terminalCode='WORKER_CONFIGURATION_CHANGED';
  for(const job of queue.splice(0))settle(job,failure(terminalCode));
  for(const slot of slots)stopSlot(slot,failure(terminalCode));
  return false;
 }
 function settle(job,error,data){if(job.done)return;job.done=true;clearTimeout(job.timer);job.signal.removeEventListener('abort',job.abort);if(error)job.reject(error);else job.resolve(data);}
 function stopSlot(slot,reason){
  if(slot.closing)return;slot.closing=true;slot.reason=reason;clearTimeout(slot.idleTimer);
  slot.killTimer=setTimeout(()=>{
   if(slot.closed)return;terminal=true;stopping=true;shutdownUnconfirmed=true;terminalCode='WORKER_TERMINATION_UNCONFIRMED';
   if(slot.job)settle(slot.job,failure('WORKER_TERMINATION_UNCONFIRMED'));
   for(const job of queue.splice(0))settle(job,failure('WORKER_TERMINATION_UNCONFIRMED'));
   for(const other of slots)if(other!==slot)stopSlot(other,failure('WORKER_TERMINATION_UNCONFIRMED'));
   slot.resolveClose(false);
  },terminationMs);
  try{slot.child.kill();}catch{}
 }
 function retireIdle(slot){clearTimeout(slot.idleTimer);slot.idleTimer=setTimeout(()=>stopSlot(slot,failure('WORKER_IDLE_CLOSED')),idleMs);slot.idleTimer.unref?.();}
 function startSlot(){
  if(!configurationCurrent())return null;
  let child;try{child=spawnProcess(process.execPath,[worker,'--runtime-persistent-read'],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});}catch{return null;}
  const slot={child,job:null,buffer:Buffer.alloc(0),closing:false,closed:false};slot.closePromise=new Promise(resolve=>slot.resolveClose=resolve);slots.add(slot);
  child.stderr.on('data',()=>{}); // Never retain or expose driver output.
  child.stdout.on('data',chunk=>{
   if(slot.closing||slot.closed)return;
   if(!configurationCurrent())return;
   slot.buffer=Buffer.concat([slot.buffer,Buffer.from(chunk)]);
   if(slot.buffer.length>1024*1024+1){stopSlot(slot,failure('WORKER_OUTPUT_LIMIT'));return;}
   const newline=slot.buffer.indexOf(10);if(newline<0)return;
   // One bounded response per active job. Extra frames are a protocol failure.
   if(newline>1024*1024||newline!==slot.buffer.length-1){stopSlot(slot,failure('WORKER_PROTOCOL_INVALID'));return;}
   let body;try{body=JSON.parse(slot.buffer.subarray(0,newline).toString('utf8'));}catch{stopSlot(slot,failure('WORKER_PROTOCOL_INVALID'));return;}
   slot.buffer=Buffer.alloc(0);const job=slot.job;
   if(!job||body?.jobId!==job.id||job.done){stopSlot(slot,failure('WORKER_PROTOCOL_INVALID'));return;}
   if(job.signal.aborted||now()>=job.deadline){stopSlot(slot,failure(job.signal.aborted?'ERP_CATALOG_REQUEST_CANCELLED':'ERP_EXISTING_STOCK_READ_UNAVAILABLE'));return;}
   if(body.success!==true){if(body.success!==false||!/^[A-Z0-9_]{1,60}$/.test(body.error?.code||'')){stopSlot(slot,failure('WORKER_PROTOCOL_INVALID'));return;}slot.job=null;settle(job,failure(body.error.code));}
   else if(body.data?.databaseName!=='VEGA2026'||body.data.databaseVerified!==true||!Array.isArray(body.data.rows)){stopSlot(slot,failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE'));return;}
   else{slot.job=null;settle(job,null,body.data);}
   retireIdle(slot);pump();
  });
  child.on('error',()=>stopSlot(slot,failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE')));
  child.stdin.on('error',()=>stopSlot(slot,failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE')));
  child.on('close',()=>{
   if(slot.closed)return;slot.closed=true;clearTimeout(slot.killTimer);clearTimeout(slot.idleTimer);slots.delete(slot);slot.resolveClose(true);
   if(slot.job)settle(slot.job,slot.reason||failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE'));
   pump();
  });
  return slot;
 }
 function pump(){
  if(stopping||terminal||!configurationCurrent())return;
  while(queue.length){
   const head=queue[0];if(head.done){queue.shift();continue;}
   if(head.signal.aborted||now()>=head.deadline){queue.shift();settle(head,failure(head.signal.aborted?'ERP_CATALOG_REQUEST_CANCELLED':'ERP_EXISTING_STOCK_READ_UNAVAILABLE'));continue;}
   let slot=[...slots].find(value=>!value.job&&!value.closing);
   if(!slot&&slots.size<size){slot=startSlot();if(!slot){settle(queue.shift(),failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE'));continue;}}
   if(!slot)return;
   const job=queue.shift();if(job.done)continue;
   if(job.signal.aborted||now()>=job.deadline){settle(job,failure(job.signal.aborted?'ERP_CATALOG_REQUEST_CANCELLED':'ERP_EXISTING_STOCK_READ_UNAVAILABLE'));retireIdle(slot);continue;}
   clearTimeout(slot.idleTimer);slot.job=job;job.slot=slot;
   try{slot.child.stdin.write(job.input+'\n');}catch{stopSlot(slot,failure('ERP_EXISTING_STOCK_READ_UNAVAILABLE'));}
  }
 }
 function read(options,eligibleIds,signal){
  if(!configurationCurrent()||stopping||terminal)return Promise.reject(failure(terminal?terminalCode:'WORKER_POOL_CLOSED'));
  if(!(signal instanceof AbortSignal))return Promise.reject(failure('WORKER_ABORT_SIGNAL_REQUIRED'));
  if(signal.aborted)return Promise.reject(failure('ERP_CATALOG_REQUEST_CANCELLED'));
  const busy=[...slots].filter(slot=>slot.job||slot.closing).length;
  if(busy>=size&&queue.length>=maxQueued)return Promise.reject(failure('WORKER_QUEUE_LIMIT'));
  if(sequence>=Number.MAX_SAFE_INTEGER)return Promise.reject(failure('WORKER_SEQUENCE_LIMIT'));
  const id=String(++sequence);let input;try{input=JSON.stringify({jobId:id,options,eligibleIds});}catch{return Promise.reject(failure('WORKER_INPUT_LIMIT'));}
  if(Buffer.byteLength(input)>65536)return Promise.reject(failure('WORKER_INPUT_LIMIT'));
  return new Promise((resolve,reject)=>{
   const job={id,input,signal,resolve,reject,deadline:now()+deadlineMs,done:false};
   const cancel=code=>{if(job.done)return;if(job.slot&&job.slot.job===job){stopSlot(job.slot,failure(code));return;}const index=queue.indexOf(job);if(index>=0)queue.splice(index,1);settle(job,failure(code));pump();};
   job.abort=()=>cancel('ERP_CATALOG_REQUEST_CANCELLED');job.timer=setTimeout(()=>cancel('ERP_EXISTING_STOCK_READ_UNAVAILABLE'),deadlineMs);signal.addEventListener('abort',job.abort,{once:true});queue.push(job);pump();
  });
 }
 async function close(){stopping=true;for(const job of queue.splice(0))settle(job,failure('WORKER_POOL_CLOSED'));const pending=[...slots];for(const slot of pending)stopSlot(slot,failure('WORKER_POOL_CLOSED'));const confirmed=await Promise.all(pending.map(slot=>slot.closePromise));return confirmed.every(Boolean)&&!shutdownUnconfirmed;}
 return {read,close,getState:()=>({workers:slots.size,queued:queue.length,active:[...slots].filter(slot=>slot.job&&!slot.closing).length,stopping,terminal})};
}
