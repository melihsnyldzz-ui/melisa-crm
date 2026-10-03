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
