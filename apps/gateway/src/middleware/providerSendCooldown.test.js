import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorHandler.js';
import { WaapiProvider } from '../providers/waapiProvider.js';

test('local provider quota retains eight calls and reports its actual rolling deadline', async () => {
  let now = 300000;
  const provider = new WaapiProvider({config:{apiToken:'synthetic',instanceId:'105185'}, now:()=>now,
    fetchFn:async()=>({ok:true,json:async()=>({status:'success'})})});
  for(let i=0;i<8;i++) await provider.request('status');
  now += 10001;
  await assert.rejects(provider.request('status'), error => error.statusCode===429
    && error.meta.transportAttempted===false && error.meta.retryAfterMs===289999);
  assert.equal(provider.calls.length,8);
  now = 600000;
  await provider.request('status');
  assert.equal(provider.calls.length,1);
});

test('only known locally blocked manual sends receive a scoped cooldown', () => {
  const respond=(error, method='POST', path='/crm/conversations/55/messages')=>{
    const headers={}; const res={setHeader:(key,value)=>{headers[key]=value;},status(){return this;},json(){return this;}};
    errorHandler(error,{method,path,requestId:'synthetic'},res,()=>{});
    return headers;
  };
  const error={statusCode:429,code:'WHATSAPP_CRM_WAAPI_RATE_LIMIT',meta:{transportAttempted:false,retryAfterMs:1501}};
  assert.deepEqual(respond(error),{'X-CRM-RateLimit-Scope':'crm-send','Retry-After':'2'});
  for(const candidate of [{...error,code:'WHATSAPP_CRM_WAAPI_HTTP_429'},
    {...error,meta:{...error.meta,transportAttempted:true}}, {...error,meta:{transportAttempted:false}}])
    assert.deepEqual(respond(candidate),{});
  assert.deepEqual(respond(error,'GET','/crm/catalog/products'),{});
});
