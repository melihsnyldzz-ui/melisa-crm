import test from 'node:test';
import assert from 'node:assert/strict';
import {terminalEntry,bindTerminalNavigation,catalogConversationHeaders} from '../src/terminalNavigation.js';

test('E1 clean terminal pairs only same-host CRM62800 and ERP5244 without accepting older profiles',()=>{
 for(const hostname of ['127.0.0.1','192.168.1.46']){
  const origin='http://'+hostname+':62800',target='http://'+hostname+':5244';
  const entry=value=>terminalEntry({origin,hostname,search:'?terminal=1&erpOrigin='+encodeURIComponent(value)});
  assert.equal(entry(target).erpOrigin,target);
  for(const bad of ['http://'+hostname+':5194','http://'+hostname+':5224','http://'+hostname+':5234','http://'+(hostname==='127.0.0.1'?'192.168.1.46':'127.0.0.1')+':5244','https://'+hostname+':5244',target+'/',target+'#session',target.replace('http://','http://name:pass@')])assert.equal(entry(bad).erpOrigin,null,bad);
  assert.equal(terminalEntry({origin,hostname,search:'?terminal=1&erpOrigin='+encodeURIComponent(target)+'&erpOrigin='+encodeURIComponent(target)}).erpOrigin,null);
  for(const port of [62400,62600,62700])assert.equal(terminalEntry({origin:'http://'+hostname+':'+port,hostname,search:'?terminal=1&erpOrigin='+encodeURIComponent(target)}).erpOrigin,null);
 }
});

test('E1 clean navigation validates the existing exact parent and never carries account credentials',async()=>{
 const target='http://127.0.0.1:5244',entry=terminalEntry({origin:'http://127.0.0.1:62800',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin='+encodeURIComponent(target)});
 let listener,activations=0,logouts=0;const messages=[],parent={postMessage:(data,origin)=>messages.push({data,origin})};
 const binding=bindTerminalNavigation({window:{parent,addEventListener:(_name,fn)=>listener=fn,removeEventListener:()=>listener=null},entry,onActivate:()=>activations++,onLogout:async()=>logouts++});
 const event={source:parent,origin:target,data:{type:'melisa-terminal-parent',version:1,action:'activate'}};
 for(const bad of [{...event,source:{}},{...event,origin:'http://127.0.0.1:5234'},{...event,data:{...event.data,userId:'guessed-account'}},{...event,data:{...event.data,token:'must-not-cross'}}])listener(bad);
 assert.equal(activations,0);listener(event);assert.equal(activations,1);
 listener({...event,data:{...event.data,action:'logout'}});await Promise.resolve();await Promise.resolve();assert.equal(logouts,1);
 assert.deepEqual(messages.map(x=>x.data.action),['ready','ready','logged-out']);
 assert(messages.every(x=>x.origin===target&&Object.keys(x.data).sort().join(',')==='action,type,version'));
 binding.close();assert.equal(listener,null);
});
test('terminal parent is exact same-host TEST ERP origin; ambiguous and credential URLs are refused',()=>{
  const entry = search => terminalEntry({hostname:'127.0.0.1',search});
  assert.deepEqual(entry('?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5194'),{enabled:true,erpOrigin:'http://127.0.0.1:5194'});
  for(const value of ['http://192.168.1.46:5194','http://127.0.0.1:5188','http://name:pass@127.0.0.1:5194','https://127.0.0.1:5194','http://127.0.0.1:5194/'])assert.equal(entry('?terminal=1&erpOrigin='+encodeURIComponent(value)).erpOrigin,null);
  assert.equal(entry('?terminal=1&terminal=0').enabled,false);
  assert.equal(entry('').enabled,false);
});
test('only exact parent source/origin navigation schema activates or logs out; no credential payload crosses',async()=>{
  let listener,activations=0,logouts=0;const messages=[],parent={postMessage:(data,origin)=>messages.push({data,origin})};
  const win={parent,addEventListener:(name,fn)=>listener=fn,removeEventListener:()=>listener=null};
  const binding=bindTerminalNavigation({window:win,entry:{enabled:true,erpOrigin:'http://127.0.0.1:5194'},onActivate:()=>activations++,onLogout:async()=>logouts++});
  const event={source:parent,origin:'http://127.0.0.1:5194',data:{type:'melisa-terminal-parent',version:1,action:'activate'}};
  for(const bad of [{...event,source:{}},{...event,origin:'http://127.0.0.1:5188'},{...event,data:{...event.data,token:'must-not-cross'}},{...event,data:{...event.data,version:2}}])listener(bad);
  assert.equal(activations,0);listener(event);assert.equal(activations,1);
  listener({...event,data:{...event.data,action:'logout'}});await Promise.resolve();await Promise.resolve();assert.equal(logouts,1);
  binding.home();assert.deepEqual(messages.map(v=>v.data.action),['ready','ready','logged-out','home']);
  assert(messages.every(v=>Object.keys(v.data).sort().join(',')==='action,type,version'));
  binding.close();assert.equal(listener,null);
});
test('conversation scope is explicit and preserves IDs without accepting paths or duplicate header text',()=>{
 assert.deepEqual(catalogConversationHeaders(undefined),{});assert.deepEqual(catalogConversationHeaders('55'),{'x-crm-conversation-id':'55'});
 for(const bad of ['0','055','55, 66','../55',{},Number.MAX_SAFE_INTEGER+1])assert.throws(()=>catalogConversationHeaders(bad));
});

test('shared terminal permits only the exact same-host ERP5224 on shared CRM62600',()=>{
 for(const host of ['127.0.0.1','192.168.1.46']){
  const target='http://'+host+':5224';
  assert.equal(terminalEntry({hostname:host,origin:'http://'+host+':62600',search:'?terminal=1&erpOrigin='+encodeURIComponent(target)}).erpOrigin,target);
  assert.equal(terminalEntry({hostname:host,origin:'http://'+host+':62400',search:'?terminal=1&erpOrigin='+encodeURIComponent(target)}).erpOrigin,null);
 }
});

test('business terminal binds only same-host DB02 ERP5234 and never previous copies',()=>{
 for(const hostname of ['127.0.0.1','192.168.1.46'])for(const port of [5234,5224,5194]){const location={origin:'http://'+hostname+':62700',hostname,search:'?terminal=1&erpOrigin='+encodeURIComponent('http://'+hostname+':'+port)};assert.equal(terminalEntry(location).erpOrigin,port===5234?'http://'+hostname+':5234':null);}
 assert.equal(terminalEntry({origin:'http://127.0.0.1:62600',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5234'}).erpOrigin,null);
});
