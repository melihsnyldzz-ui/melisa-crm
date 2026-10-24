import test from 'node:test';
import assert from 'node:assert/strict';
import {env} from '../config/env.js';
import {readCrmOutboundStatus} from './sendService.js';
import {fingerprintOutbound,createMemoryOutboundAttemptStore,createRedisOutboundAttemptStore} from './outboundAttemptService.js';
import {normalizeOutboundMedia} from '../utils/messageMedia.js';
import {createOutboundStatusController,createOutboundStatusRequestGuard} from '../controllers/conversationController.js';
import {errorHandler} from '../middleware/errorHandler.js';
import {createApp} from '../app.js';
import {createPasswordHash} from './crmAuthService.js';
import {once} from 'node:events';

const input = {actorId:'3',conversationId:'55',phone:'905387217733',remoteJid:'synthetic@lid',text:'Preserved caption',media:{dataUrl:'data:text/plain;base64,aGVsbG8=',mimeType:'text/plain',fileName:'synthetic.txt',mediaType:'document'},clientRequestId:'SYNTHETIC-READ-001'};
const fingerprint = value => fingerprintOutbound({actorId:String(value.actorId),conversationId:value.conversationId,provider:env.whatsapp.provider,phone:value.phone,remoteJid:value.remoteJid,text:value.text,media:normalizeOutboundMedia(value.media)});

test('journal read verifies actor, conversation, full text and media bytes without any mutation or provider access',async()=>{
 const store=createMemoryOutboundAttemptStore();store.reset();
 await store.begin({clientRequestId:input.clientRequestId,fingerprint:fingerprint(input),conversationId:'55',provider:env.whatsapp.provider});
 await store.update(input.clientRequestId,{state:'REJECTED_BEFORE_TRANSPORT'});
 const onlyRead={get:id=>store.get(id),begin(){throw Error('write forbidden');},update(){throw Error('write forbidden');}};
 const deps={attemptStore:onlyRead,provider:{sendMessage(){throw Error('transport forbidden');}}};
 assert.equal((await readCrmOutboundStatus(input,deps)).deliveryState,'REJECTED_BEFORE_TRANSPORT');
 for(const changed of [{actorId:'4'},{conversationId:'56'},{phone:'905551112233'},{text:'other caption'},{media:{...input.media,dataUrl:'data:text/plain;base64,d29ybGQ='}},{media:{...input.media,fileName:'different.txt'}}])
  await assert.rejects(readCrmOutboundStatus({...input,...changed},deps),e=>e.statusCode===409&&e.meta===undefined);
 await assert.rejects(readCrmOutboundStatus({...input,clientRequestId:'SYNTHETIC-MISSING'},deps),e=>e.statusCode===404);
 await assert.rejects(readCrmOutboundStatus({...input,clientRequestId:''},deps),e=>e.statusCode===400);
 assert.equal((await store.get(input.clientRequestId)).state,'REJECTED_BEFORE_TRANSPORT');store.reset();
});

test('Redis status lookup executes GET only and preserves unknown absence',async()=>{
 const calls=[];
 const store=createRedisOutboundAttemptStore(work=>work({get:async key=>{calls.push(['GET',key]);return null;},set(){throw Error('write forbidden');},pttl(){throw Error('not needed');}}));
 assert.equal(await store.get(input.clientRequestId),null);assert.equal(calls.length,1);assert.equal(calls[0][0],'GET');
});

test('status controller checks assignment and current personnel before and after the journal read',async()=>{
 for(const failure of ['none','before','after','assignment']){
  const calls=[];let guardCalls=0,error,json;
  const handler=createOutboundStatusController({makeGuard:()=>async()=>{calls.push('guard');if((failure==='before'&&++guardCalls===1)||(failure==='after'&&++guardCalls===2))throw Object.assign(Error('revoked'),{statusCode:401});},
   readConversation:async()=>{calls.push('conversation');return {...input,id:'55'};},readStatus:async body=>{calls.push('journal');assert.equal(body.actorId,'3');return {deliveryState:'REJECTED_BEFORE_TRANSPORT'};},
   readAccess:async()=>{calls.push('assignment');if(failure==='assignment')throw Object.assign(Error('reassigned'),{statusCode:403});}});
  await handler({params:{conversationId:'55'},body:input,user:{id:'3'}},{status(){return this;},json(value){json=value;}},e=>{error=e;});
  if(failure==='none'){assert.equal(json.data.deliveryState,'REJECTED_BEFORE_TRANSPORT');assert.deepEqual(calls,['guard','conversation','journal','assignment','guard']);}
  else{assert.equal(json,undefined);assert.equal(error.statusCode,failure==='assignment'?403:401);if(failure==='before')assert.deepEqual(calls,['guard']);}
 }
});

test('only a definite message transport rejection exposes the trusted false flag',()=>{
 for(const [path,meta,expected] of [['/crm/conversations/55/messages',{transportAttempted:false},false],['/crm/conversations/55/messages',{},undefined],['/crm/conversations/55/messages/status',{transportAttempted:false},undefined]]){
  let json;errorHandler({statusCode:503,code:'WHATSAPP_CRM_WAAPI_NOT_READY',message:'synthetic',meta},{method:'POST',path},{headersSent:false,status(){return this;},json(value){json=value;}},()=>{});
  assert.equal(json.meta.transportAttempted,expected);
 }
});

test('status readback rechecks existing ordinary and TEST actors, permissions and role identity',()=>{
 for(const testPersonnel of [false,true]){
  const user={id:'3',username:'synthetic',role:'personel',chatwootAgentId:3,active:true,testPersonnel,permissions:['crm.send']};
  let current=user;const guard=createOutboundStatusRequestGuard({user,get:()=> 'Bearer synthetic-token'},()=>current);
  assert.equal(guard().id,'3');
  for(const change of [{active:false},{id:'4'},{role:'mudur'},{chatwootAgentId:4},{testPersonnel:!testPersonnel},{permissions:[]}]){
   current={...user,...change};assert.throws(guard,error=>[401,403].includes(error.statusCode));
  }
 }
});

test('actual status route rejects missing token and ordinary view-only personnel before any provider read',async t=>{
 const auth={...env.auth};t.after(()=>Object.assign(env.auth,auth));
 const password='Synthetic-Status-Password-2026!';
 Object.assign(env.auth,{jwtSecret:'synthetic-status-secret-at-least-thirty-two-chars',personnelCanSend:false,
  users:[{id:'status-staff',username:'status-staff',active:true,role:'personel',chatwootAgentId:3,passwordHash:createPasswordHash(password)}]});
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`,nativeFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=nativeFetch;});
 globalThis.fetch=(url,options)=>{assert(String(url).startsWith(base),'denied status must not read upstream');return nativeFetch(url,options);};
 const path=base+'/crm/conversations/55/messages/status',options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)};
 assert.equal((await fetch(path,options)).status,401);
 const login=await fetch(base+'/auth/login',{...options,body:JSON.stringify({username:'status-staff',password})});assert.equal(login.status,200);
 const session=await login.json();assert.equal((await fetch(path,{...options,headers:{...options.headers,Authorization:`Bearer ${session.data.accessToken}`}})).status,403);
});
