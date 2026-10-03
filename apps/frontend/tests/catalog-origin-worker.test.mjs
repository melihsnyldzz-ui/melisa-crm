import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const origin='https://melisa-crm-ozel-tasarim-testi.melihsnyldzz.chatgpt.site';
function fixture(){const calls=[];return {calls,env:{CRM_API_BASE_URL:'https://crm-api.example.test',CRM_API_FETCH:async request=>{calls.push(request);return Response.json({success:true});},ASSETS:{fetch:()=>new Response('app')}}};}
test('catalog sign-in/out require exact same UI Origin and POST; missing/foreign origin never reaches upstream',async()=>{
 for(const path of ['sign-in','sign-out'])for(const options of [{},{method:'POST'},{method:'POST',headers:{Origin:'https://other.example'}},{method:'POST',headers:{Origin:'null'}},{headers:{Origin:origin}}]){
  const {calls,env}=fixture();const response=await worker.fetch(new Request(`${origin}/api/live/crm/catalog/auth/${path}`,options),env);assert.equal(response.status,403);assert.equal(calls.length,0);
 }
 const {calls,env}=fixture();const response=await worker.fetch(new Request(`https://other.example/api/live/crm/catalog/auth/sign-in`,{method:'POST',headers:{Origin:origin}}),env);assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('exact catalog POST forwards only allowed auth/content headers plus verified fixed Origin',async()=>{
 for(const path of ['sign-in','sign-out']){
  const {calls,env}=fixture();const response=await worker.fetch(new Request(`${origin}/api/live/crm/catalog/auth/${path}`,{method:'POST',headers:{Origin:origin,Authorization:'Bearer synthetic','Content-Type':'application/json',Cookie:'private'},body:'{}'}),env);
  assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].headers.get('Origin'),origin);assert.equal(calls[0].headers.get('Authorization'),'Bearer synthetic');assert.equal(calls[0].headers.get('Content-Type'),'application/json');assert.equal(calls[0].headers.get('Cookie'),null);
 }
});
test('ordinary login/chat keep original proxy behavior and do not forward arbitrary Origin',async()=>{
 for(const path of ['/auth/login','/crm/inbox']){
  const {calls,env}=fixture();const response=await worker.fetch(new Request(`${origin}/api/live${path}`,{headers:{Origin:'https://other.example'}}),env);assert.equal(response.status,200);assert.equal(calls[0].headers.get('Origin'),null);
 }
});

test('catalog GET never forwards browser Origin and preserves exact no-meta ERP-session 401',async()=>{
 const requests=[],payload={success:false,error:{code:'USER_ERP_SESSION_REQUIRED',message:'USER_ERP_SESSION_REQUIRED'}};
 const response=await worker.fetch(new Request(`${origin}/api/live/crm/catalog/products?search=&page=1&limit=100`,{headers:{Origin:origin,Authorization:'Bearer synthetic-crm',Accept:'application/json'}}),{
  CRM_API_BASE_URL:'https://crm-api.example.test',
  CRM_API_FETCH:async request=>{requests.push(request);return Response.json(payload,{status:401});},
  ASSETS:{fetch:()=>{throw new Error('API denial must not fall back to HTML');}},
 });
 assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.equal(requests[0].headers.get('Origin'),null);assert.equal(requests[0].headers.get('Authorization'),'Bearer synthetic-crm');assert.equal(new URL(requests[0].url).pathname+new URL(requests[0].url).search,'/crm/catalog/products?search=&page=1&limit=100');assert.equal(response.status,401);assert.deepEqual(await response.json(),payload);
});
