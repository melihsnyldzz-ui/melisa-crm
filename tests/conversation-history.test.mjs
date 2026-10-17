import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../apps/gateway/node_modules/jsonwebtoken/index.js';
import {env} from '../apps/gateway/src/config/env.js';
import {createPasswordHash,verifyCrmAccessToken} from '../apps/gateway/src/services/crmAuthService.js';
import {parseConversationHistoryBefore,createConversationHistoryRequestGuard,getConversationDetail} from '../apps/gateway/src/controllers/conversationController.js';

test('history query accepts only one canonical positive safe cursor, before any backend read',async()=>{
  assert.equal(parseConversationHistoryBefore({}),undefined);
  assert.equal(parseConversationHistoryBefore({before:'12'}),12);
  assert.equal(parseConversationHistoryBefore({before:String(Number.MAX_SAFE_INTEGER)}),Number.MAX_SAFE_INTEGER);
  for(const query of [{before:['12','13']},{before:'0'},{before:'01'},{before:'-1'},{before:'1.5'},{before:'1e2'},{before:' 1'},{before:'9007199254740992'},{before:'12',after:'15'},{after:'12'}]){
    assert.throws(()=>parseConversationHistoryBefore(query),{code:'WHATSAPP_CRM_HISTORY_CURSOR_INVALID',statusCode:400});
    let result;await getConversationDetail({query}, {json(){assert.fail('must not return data');}},e=>{result=e;});
    assert.equal(result.statusCode,400);
  }
});

test('older history guard uses official normal Bearer verification and rejects changed actor, permission and expired token',async t=>{
  const previous={...env.auth},now=Date.now;
  t.after(()=>{Object.assign(env.auth,previous);Date.now=now;});
  const entry={id:'synthetic-history-staff',username:'synthetic-history',role:'personel',chatwootAgentId:7,active:true,passwordHash:createPasswordHash('synthetic-history-only-password')};
  Object.assign(env.auth,{jwtSecret:'synthetic-history-secret-32-characters-minimum',issuer:'synthetic-history',audience:'synthetic-history',users:[entry],personnelCanSend:false});
  const token=jwt.sign({username:entry.username,role:entry.role},env.auth.jwtSecret,{subject:entry.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:60});
  const actor=verifyCrmAccessToken(token);
  const req={user:actor,params:{conversationId:'1'},get:()=>`Bearer ${token}`};
  const guard=createConversationHistoryRequestGuard(req);
  assert.equal((await guard()).id,entry.id);
  for(const patch of [{active:false},{chatwootAgentId:8},{role:'mudur'}]){
    env.auth.users=[{...entry,...patch}];await assert.rejects(guard,{code:'AUTH_TOKEN_INVALID',statusCode:401});
  }
  env.auth.users=[entry];
  Date.now=()=>now()+120000;
  await assert.rejects(guard,{code:'AUTH_TOKEN_EXPIRED',statusCode:401});Date.now=now;
  const unresolvedSid=jwt.sign({username:entry.username,role:entry.role,normalSessionId:'d26c87f0-f246-4f25-a413-60b476f0714e'},env.auth.jwtSecret,{subject:entry.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:60});
  await assert.rejects(createConversationHistoryRequestGuard({...req,get:()=>`Bearer ${unresolvedSid}`}),{code:'AUTH_TOKEN_INVALID',statusCode:401});
});

test('actual older-page controller performs only three GETs and blocks post-read normal token/actor drift without json',async t=>{
  const previous={auth:{...env.auth},chatwoot:{...env.chatwoot},whatsapp:{...env.whatsapp},fetch:global.fetch,now:Date.now};
  t.after(()=>{Object.assign(env.auth,previous.auth);Object.assign(env.chatwoot,previous.chatwoot);Object.assign(env.whatsapp,previous.whatsapp);global.fetch=previous.fetch;Date.now=previous.now;});
  const entry={id:'synthetic-controller-staff',username:'synthetic-controller',role:'personel',chatwootAgentId:7,active:true,passwordHash:createPasswordHash('synthetic-controller-only-password')};
  const secret='synthetic-controller-secret-32-characters-minimum';
  Object.assign(env.chatwoot,{baseUrl:'http://chatwoot.local',accountId:2,inboxId:1,apiAccessToken:'synthetic-controller-history',includeGroups:false});
  Object.assign(env.whatsapp,{provider:'evolution',sendEnabled:false});
  for(const scenario of ['success','inactive','permissions','agent','expired','invalidated-token','reassigned']){
    Object.assign(env.auth,{jwtSecret:secret,issuer:'synthetic-controller',audience:'synthetic-controller',users:[entry],personnelCanSend:false});Date.now=previous.now;
    const token=jwt.sign({username:entry.username,role:entry.role},secret,{subject:entry.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:60});
    const req={query:{before:'10'},params:{conversationId:'1'},user:verifyCrmAccessToken(token),get:()=>`Bearer ${token}`};
    const calls=[];let release,started,assignee=7,returned=null,failure=null;
    const waiting=new Promise(resolve=>{started=resolve;});
    global.fetch=async(url,options)=>{const parsed=new URL(url);calls.push({path:parsed.pathname,query:parsed.search,method:options.method});
      if(parsed.pathname.endsWith('/messages')){assert.equal(parsed.search,'?before=10');started();await new Promise(resolve=>{release=resolve;});return Response.json({payload:[{id:9,conversation_id:1,message_type:0,content:'Synthetic protected history'}]});}
      return Response.json({id:1,inbox_id:1,status:'open',meta:{sender:{phone_number:'+18880000001',name:'Synthetic'},assignee:{id:assignee}}});};
    const pending=getConversationDetail(req,{json(value){returned=value;return value;}},error=>{failure=error;});
    await waiting;
    if(scenario==='inactive')env.auth.users=[{...entry,active:false}];
    if(scenario==='permissions')env.auth.personnelCanSend=true;
    if(scenario==='agent')env.auth.users=[{...entry,chatwootAgentId:8}];
    if(scenario==='expired')Date.now=()=>previous.now()+120000;
    if(scenario==='invalidated-token')env.auth.jwtSecret=secret+'-changed';
    if(scenario==='reassigned')assignee=8;
    release();await pending;
    assert.equal(calls.length,3,scenario);assert.equal(calls.filter(call=>call.path.endsWith('/messages')).length,1);assert(calls.every(call=>call.method==='GET'));
    if(scenario==='success'){assert.equal(failure,null);assert.deepEqual(returned.data.history,{nextBefore:9,hasMore:true});assert.equal(returned.data.messages.length,1);}
    else {assert.equal(returned,null,scenario);assert.equal(failure.statusCode,scenario==='reassigned'?403:401,scenario);assert.equal(failure.code,scenario==='expired'?'AUTH_TOKEN_EXPIRED':scenario==='reassigned'?'WHATSAPP_CRM_CONVERSATION_FORBIDDEN':'AUTH_TOKEN_INVALID',scenario);}
  }
});
