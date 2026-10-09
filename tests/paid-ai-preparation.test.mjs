import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/gateway/src/app.js';
import {installTestAdminSession} from '../apps/gateway/src/services/testAdminSession.mjs';
import {assertPaidAiAllowed} from '../apps/gateway/src/services/paidAiPolicy.mjs';
import {getHealth} from '../apps/gateway/src/services/healthService.js';
import {WaapiProvider} from '../apps/gateway/src/providers/waapiProvider.js';
import {translateConversationText} from '../apps/gateway/src/services/translationService.js';
import {createSalesGenerator} from '../apps/gateway/src/services/salesAgent/responses.mjs';

test('paid policy requires deployment enablement and explicit action; isolation cannot be overridden',()=>{
  const intent={userInitiated:true,action:'manual'};
  for(const policy of [{},{CRM_PAID_AI_ENABLED:'false'},{CRM_PAID_AI_ENABLED:'true',CRM_ISOLATED_PREPARATION:'true'}])
    assert.throws(()=>assertPaidAiAllowed(intent,policy),e=>e.code==='AI_PAID_DISABLED');
  for(const missing of [undefined,{},true,{userInitiated:false,action:'manual'},{userInitiated:true,action:'mount'}])
    assert.throws(()=>assertPaidAiAllowed(missing,{CRM_PAID_AI_ENABLED:'true'}),e=>e.code==='AI_USER_ACTION_REQUIRED');
  assert.doesNotThrow(()=>assertPaidAiAllowed(intent,{CRM_PAID_AI_ENABLED:'true'}));
});

test('HTTP translation/copilot reject disabled policy or missing explicit action before model and customer reads',async()=>{
  const prior=Object.fromEntries(['CRM_PAID_AI_ENABLED','CRM_AI_SALES_MODE','CRM_ISOLATED_PREPARATION'].map(k=>[k,process.env[k]]));
  const nativeFetch=globalThis.fetch;let externalCalls=0;
  globalThis.fetch=async(input,options)=>{const url=new URL(input);if(url.hostname==='127.0.0.1')return nativeFetch(input,options);externalCalls++;throw Error('EXTERNAL_CALL_FORBIDDEN');};
  const session=installTestAdminSession({uiOrigin:'http://127.0.0.1:62500',gatewayOrigin:'http://127.0.0.1:62501'});
  const token=session().accessToken;
  process.env.CRM_AI_SALES_MODE='copilot';delete process.env.CRM_ISOLATED_PREPARATION;
  const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {
    for(const endpoint of ['translate','sales-draft'])for(const enabled of [false,true]){
      process.env.CRM_PAID_AI_ENABLED=String(enabled);
      const body={mode:'incoming_to_tr',text:'Synthetic fixture',...(!enabled?{aiIntent:{userInitiated:true,action:'manual'}}:{})};
      const response=await nativeFetch(`http://127.0.0.1:${server.address().port}/crm/conversations/55/${endpoint}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
      assert.equal(response.status,403);assert.equal((await response.json()).error.code,enabled?'AI_USER_ACTION_REQUIRED':'AI_PAID_DISABLED');
    }
    assert.equal(externalCalls,0);
  }finally{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(r=>server.close(r));for(const[k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;}
});

test('isolated health, direct provider and direct model paths never call external services',async()=>{
  const previous=process.env.CRM_ISOLATED_PREPARATION;process.env.CRM_ISOLATED_PREPARATION='true';let calls=0;
  const forbidden=async()=>{calls++;throw Error('EXTERNAL_CALL_FORBIDDEN');};
  try{
    const health=await getHealth();assert.equal(health.sendEnabled,false);assert.equal(health.translationEnabled,false);
    const provider=new WaapiProvider({config:{apiToken:'synthetic',instanceId:'105185'},fetchFn:forbidden});
    await assert.rejects(provider.request('status'),e=>e.code==='WHATSAPP_CRM_PREPARATION_PROVIDER_DISABLED');
    await assert.rejects(translateConversationText({}, {fetch:forbidden}),e=>e.code==='AI_PAID_DISABLED');
    const generate=createSalesGenerator({apiKey:'synthetic',model:'synthetic'},forbidden);
    await assert.rejects(generate({}),e=>e.code==='AI_PAID_DISABLED');assert.equal(calls,0);
  }finally{previous===undefined?delete process.env.CRM_ISOLATED_PREPARATION:process.env.CRM_ISOLATED_PREPARATION=previous;}
});

test('shared gateway rejects every upstream write before auth, parsing, Chatwoot, rules, provider or model',async()=>{
 const prior=process.env.CRM_ISOLATED_PREPARATION;process.env.CRM_ISOLATED_PREPARATION='true';
 const nativeFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('UPSTREAM_WRITE_FORBIDDEN');};
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  for(const [method,path] of [['POST','/crm/conversations/55/assign'],['POST','/crm/conversations/55/messages'],['POST','/crm/conversations/55/messages/status'],['POST','/crm/conversations/55/translate'],['POST','/crm/conversations/55/sales-draft'],['PUT','/crm/sales-rules'],['POST','/crm/messages/send'],['POST','/webhooks/evolution'],['POST','/webhooks/waapi/synthetic'],['POST','/crm/catalog/auth/sign-in'],['PATCH','/crm/conversations/55'],['DELETE','/crm/conversations/55'],['POST','/future-write-route']]){
   const response=await nativeFetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'content-type':'application/json'},body:'{invalid JSON intentionally'});assert.equal(response.status,403,path);assert.equal((await response.json()).error.code,'CRM_PREPARATION_READ_ONLY',path);
  }
  const login=await nativeFetch('http://127.0.0.1:'+server.address().port+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.notEqual((await login.json()).error?.code,'CRM_PREPARATION_READ_ONLY');assert.equal(calls,0);
 }finally{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(r=>server.close(r));prior===undefined?delete process.env.CRM_ISOLATED_PREPARATION:process.env.CRM_ISOLATED_PREPARATION=prior;}
});
