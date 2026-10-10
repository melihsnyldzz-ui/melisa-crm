import test from 'node:test';
import assert from 'node:assert/strict';
import {SHARED_STABLE_ORIGIN,resolveCrmApiRoot} from '../src/sharedStableTopology.mjs';
import {terminalEntry,bindTerminalNavigation} from '../src/terminalNavigation.js';
import {testAdminAvailable} from '../src/testAdmin.js';
const location={origin:SHARED_STABLE_ORIGIN,pathname:'/crm/',search:'?terminal=1&erpOrigin='+encodeURIComponent(SHARED_STABLE_ORIGIN)};
test('only the exact stable build and CRM mount route API through /crm/api/live',()=>{
 assert.equal(resolveCrmApiRoot(location,true),'/crm/api/live');
 for(const changed of [{origin:'https://semih.tail295701.ts.net'},{origin:SHARED_STABLE_ORIGIN+'.evil'},{origin:'http://semih.tail295701.ts.net:8443'},{pathname:'/crm-evil/'},{pathname:'/'}])assert.equal(resolveCrmApiRoot({...location,...changed},true),'/api/live');
 assert.equal(resolveCrmApiRoot(location,false),'/api/live');
 assert.equal(resolveCrmApiRoot({origin:'http://127.0.0.1:62700',pathname:'/'},false),'/api/live');
});
test('stable terminal requires exact parent origin and mounted CRM, never test-admin bootstrap availability',()=>{
 assert.deepEqual(terminalEntry(location),{enabled:true,erpOrigin:SHARED_STABLE_ORIGIN});
 assert.equal(testAdminAvailable(location,true),false);
 assert.equal(testAdminAvailable({origin:'http://127.0.0.1:62700'},true),true);
 for(const origin of [SHARED_STABLE_ORIGIN+'/',SHARED_STABLE_ORIGIN+'/terminal.html','http://127.0.0.1:5234','https://user:pass@semih.tail295701.ts.net:8443','https://semih.tail295701.ts.net:8443?x=1'])assert.equal(terminalEntry({...location,search:'?terminal=1&erpOrigin='+encodeURIComponent(origin)}).erpOrigin,null);
 assert.equal(terminalEntry({...location,pathname:'/other/'}).erpOrigin,null);
 assert.equal(terminalEntry({...location,search:location.search+'&erpOrigin='+encodeURIComponent(SHARED_STABLE_ORIGIN)}).erpOrigin,null);
});
test('stable navigation preserves exact postMessage source, origin and credential-free schema',()=>{
 let listener,activated=0;const calls=[];const parent={postMessage:(data,origin)=>calls.push({data,origin})};
 const win={parent,addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>{}};
 const binding=bindTerminalNavigation({window:win,entry:terminalEntry(location),onActivate:()=>activated++});
 const event={source:parent,origin:SHARED_STABLE_ORIGIN,data:{type:'melisa-terminal-parent',version:1,action:'activate'}};
 for(const bad of [{...event,source:{}},{...event,origin:SHARED_STABLE_ORIGIN+'.evil'},{...event,data:{...event.data,token:'fixture'}}])listener(bad);
 assert.equal(activated,0);listener(event);assert.equal(activated,1);binding.home();
 assert(calls.every(call=>call.origin===SHARED_STABLE_ORIGIN&&Object.keys(call.data).sort().join(',')==='action,type,version'));
});
