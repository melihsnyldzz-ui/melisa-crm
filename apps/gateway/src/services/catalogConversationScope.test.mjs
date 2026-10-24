import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeCatalogConversation} from './catalogConversationScope.mjs';
function fixture(){let agent=7,assignee=7,reads=0,checks=0,revoked=false,afterRead=()=>{};const user={id:'staff',role:'personel',chatwootAgentId:7};const handler=scopeCatalogConversation({
 verifyCrmContext:()=>{if(revoked)throw Object.assign(Error('AUTH_TOKEN_INVALID'),{code:'AUTH_TOKEN_INVALID',statusCode:401});return{user:{...user,chatwootAgentId:agent}};},
 readConversation:async({conversationId,user})=>{checks++;assert.equal(conversationId,'55');if(user.chatwootAgentId!==assignee)throw Object.assign(Error('denied'),{code:'WHATSAPP_CRM_CONVERSATION_FORBIDDEN',statusCode:403});},
 read:async()=>{reads++;afterRead();return Response.json({safe:true});}});
 return{handler,stats:()=>({reads,checks}),assign:v=>assignee=v,drift:fn=>afterRead=fn,revoke:()=>revoked=true,agent:v=>agent=v};}
function request(path, id='55'){return new Request('http://test'+path,{headers:{authorization:'Bearer synthetic',...(id===null?{}:{'x-crm-conversation-id':id})}});}
for(const path of ['/crm/catalog/products','/crm/catalog/products/erp-36724','/crm/catalog/products/erp-36724/photo'])test('assignment is checked before and after '+path,async()=>{
 const f=fixture();assert.equal((await f.handler(request(path))).status,200);assert.deepEqual(f.stats(),{reads:1,checks:2});
 f.assign(8);assert.equal((await f.handler(request(path))).status,403);assert.equal(f.stats().reads,1);
});
test('reassignment or JWT revocation while ERP bytes are read suppresses the result',async()=>{
 for(const mutate of ['assignment','jwt','actor']){const f=fixture();f.drift(()=>mutate==='assignment'?f.assign(8):mutate==='jwt'?f.revoke():f.agent(8));const r=await f.handler(request('/crm/catalog/products/erp-36724/photo'));assert.equal(r.status,mutate==='jwt'?401:403);assert.equal((await r.json()).success,false);}
});
test('existing general catalog read stays approved; malformed scoped ID is rejected before transport',async()=>{
 const f=fixture();assert.equal((await f.handler(request('/crm/catalog/products',null))).status,200);assert.equal(f.stats().checks,0);
 for(const id of ['055','0','55,66','../55'])assert.equal((await f.handler(request('/crm/catalog/products',id))).status,400);assert.equal(f.stats().reads,1);
});
