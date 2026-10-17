import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createCrmStockWorkerPool} from './crmStockWorkerPool.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const children=[];const pool=createCrmStockWorkerPool({terminationMs:30,idleMs:100,deadlineMs:1000,...options,spawnProcess:()=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.inputs=[];child.stdin.write=line=>{child.inputs.push(JSON.parse(line));};child.kills=0;child.autoClose=true;child.kill=()=>{child.kills++;if(child.autoClose)queueMicrotask(()=>child.emit('close',0));};children.push(child);return child;
 }});
 const read=(signal=new AbortController().signal,scope=[])=>pool.read({id:7},scope,signal);
 const respond=(child,value=0)=>{const jobId=child.inputs.at(-1).jobId;child.stdout.emit('data',JSON.stringify({jobId,success:true,data:{databaseName:'VEGA2026',databaseVerified:true,rows:[],value}})+'\n');};
 return{pool,children,read,respond};
}
test('two workers bound parallel reads and each reused slot executes a new job',async()=>{
 const f=fixture();try{const a=f.read(),b=f.read(),c=f.read();assert.equal(f.children.length,2);assert.equal(f.pool.getState().queued,1);f.respond(f.children[0],1);assert.equal((await a).value,1);assert.equal(f.children[0].inputs.length,2);f.respond(f.children[0],3);f.respond(f.children[1],2);assert.equal((await c).value,3);assert.equal((await b).value,2);assert.notEqual(f.children[0].inputs[0].jobId,f.children[0].inputs[1].jobId);}finally{assert.equal(await f.pool.close(),true);}
});
test('queue limit and queued abort never kill an unrelated active reader',async()=>{
 const f=fixture({size:1,maxQueued:1});const active=f.read(),cancel=new AbortController(),queued=f.read(cancel.signal);const rejected=assert.rejects(queued,/ERP_CATALOG_REQUEST_CANCELLED/);
 try{await assert.rejects(f.read(),/WORKER_QUEUE_LIMIT/);cancel.abort();await rejected;assert.equal(f.children[0].kills,0);assert.equal(f.pool.getState().queued,0);f.respond(f.children[0]);await active;}finally{await f.pool.close();}
});
test('active cancellation waits for confirmed close and replacement leaves other reader intact',async()=>{
 const f=fixture();const cancel=new AbortController(),active=f.read(cancel.signal),other=f.read(),queued=f.read();let settled=false;active.catch(()=>{settled=true;});f.children[0].autoClose=false;
 try{cancel.abort();await tick();assert.equal(settled,false);assert.equal(f.children[0].kills,1);assert.equal(f.children[1].kills,0);assert.equal(f.children.length,2);f.children[0].emit('close',0);await assert.rejects(active,/ERP_CATALOG_REQUEST_CANCELLED/);assert.equal(f.children.length,3);f.respond(f.children[1]);f.respond(f.children[2]);await other;await queued;}finally{await f.pool.close();}
});
test('unconfirmed termination makes the pool terminal and forbids replacement',async()=>{
 const f=fixture({size:1,terminationMs:10});const cancel=new AbortController(),active=f.read(cancel.signal);const rejected=assert.rejects(active,/WORKER_TERMINATION_UNCONFIRMED/);f.children[0].autoClose=false;cancel.abort();await rejected;assert.equal(f.pool.getState().terminal,true);await assert.rejects(f.read(),/WORKER_TERMINATION_UNCONFIRMED/);assert.equal(f.children.length,1);assert.equal(await f.pool.close(),false);
});
test('absolute deadline expires queued jobs without granting a fresh execution budget',async()=>{
 let now=0;const f=fixture({size:1,deadlineMs:100,now:()=>now});const active=f.read(),queued=f.read();const rejected=assert.rejects(queued,/ERP_EXISTING_STOCK_READ_UNAVAILABLE/);
 try{now=101;f.respond(f.children[0]);await assert.rejects(active,/ERP_EXISTING_STOCK_READ_UNAVAILABLE/);await rejected;assert.equal(f.children[0].inputs.length,1);assert.equal(f.children.length,1);}finally{await f.pool.close();}
});
test('bounded input, response identity and frame size fail closed',async()=>{
 const f=fixture({size:1});try{await assert.rejects(f.read(undefined,Array(40000).fill(7)),/WORKER_INPUT_LIMIT/);assert.equal(f.children.length,0);const active=f.read(),rejected=assert.rejects(active,/WORKER_PROTOCOL_INVALID/);f.children[0].stdout.emit('data',JSON.stringify({jobId:'other',success:true,data:{}})+'\n');await rejected;const next=f.read(),tooLarge=assert.rejects(next,/WORKER_OUTPUT_LIMIT/);f.children.at(-1).stdout.emit('data',Buffer.alloc(1024*1024+2));await tooLarge;}finally{await f.pool.close();}
});
test('parent configuration drift rejects old results and queued jobs without respawning',async()=>{
 const key='VEGA_SQL_SERVER',previous=process.env[key];const f=fixture({size:1});const active=f.read(),queued=f.read();const a=assert.rejects(active,/WORKER_CONFIGURATION_CHANGED/),b=assert.rejects(queued,/WORKER_CONFIGURATION_CHANGED/);
 try{process.env[key]='synthetic-drift-only';f.respond(f.children[0]);await a;await b;assert.equal(f.children[0].kills,1);assert.equal(f.pool.getState().terminal,true);await assert.rejects(f.read(),/WORKER_CONFIGURATION_CHANGED/);assert.equal(f.children.length,1);assert.equal(await f.pool.close(),true);}finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;await f.pool.close();}
});
test('pool bounds reject nonfinite timers',()=>{
 for(const deadlineMs of [NaN,Infinity,1.5,0,14001])assert.throws(()=>createCrmStockWorkerPool({deadlineMs}),/WORKER_POOL_BOUNDS_REQUIRED/);
});
