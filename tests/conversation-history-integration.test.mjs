import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../apps/gateway/node_modules/jsonwebtoken/index.js';
import {env} from '../apps/gateway/src/config/env.js';
import {createPasswordHash,verifyCrmAccessToken} from '../apps/gateway/src/services/crmAuthService.js';
import {getConversationDetail} from '../apps/gateway/src/controllers/conversationController.js';
import {liveApi} from '../apps/frontend/src/liveApi.js';

// Exercise both production adapters. Every transport is synthetic and every
// unrecognised URL fails; no shared service or credential file is accessed.
test('frontend and actual controller traverse public media, hidden-only pages and empty end without fabricated totals',async t=>{
  const previous={auth:{...env.auth},chatwoot:{...env.chatwoot},whatsapp:{...env.whatsapp},fetch:global.fetch};
  t.after(()=>{Object.assign(env.auth,previous.auth);Object.assign(env.chatwoot,previous.chatwoot);Object.assign(env.whatsapp,previous.whatsapp);global.fetch=previous.fetch;});
  const entry={id:'synthetic-history-coupled',username:'synthetic-history-coupled',role:'personel',chatwootAgentId:7,active:true,passwordHash:createPasswordHash('synthetic-history-coupled-password')};
  Object.assign(env.auth,{jwtSecret:'synthetic-history-coupled-secret-32-characters',issuer:'synthetic-history-coupled',audience:'synthetic-history-coupled',users:[entry],personnelCanSend:false});
  Object.assign(env.chatwoot,{baseUrl:'http://chatwoot.local',accountId:2,inboxId:1,apiAccessToken:'synthetic-history-coupled',includeGroups:false,agentPersonnelMap:new Map([[7,7]])});
  Object.assign(env.whatsapp,{provider:'evolution',sendEnabled:false});
  const token=jwt.sign({username:entry.username,role:entry.role},env.auth.jwtSecret,{subject:entry.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:60});
  const raw=(id,patch={})=>({id,conversation_id:1,created_at:1720000000+id,message_type:0,content:'Synthetic public history',...patch});
  const pages=new Map([
    ['',Array.from({length:20},(_,i)=>raw(21+i))],
    ['21',[raw(20,{message_type:2,content:'Synthetic hidden activity'}),raw(19,{private:true,content:'Synthetic hidden note'}),raw(18,{content:'',attachments:[{id:180,file_type:'image',content_type:'image/jpeg',data_url:'https://example.invalid/synthetic-history-photo.jpg'}]})]],
    ['18',[raw(16,{private:true,content:'Synthetic hidden-only page'})]],
    ['16',[raw(15,{content:'',attachments:[{id:150,file_type:'file',content_type:'application/pdf',data_url:'https://example.invalid/synthetic-history.pdf',fallback_title:'synthetic-history.pdf'}]})]],
    ['15',[]],
  ]);
  const requests=[],provider=[];
  global.fetch=async(input,options={})=>{
    const value=String(input);
    if(value.startsWith('/api/live/crm/conversations/')){
      const url=new URL(value,'http://synthetic-ui.invalid');requests.push(url.search);
      assert.equal(options.headers.Authorization,`Bearer ${token}`);
      let output=null,failure=null;
      await getConversationDetail({query:Object.fromEntries(url.searchParams),params:{conversationId:'1'},user:verifyCrmAccessToken(token),get:name=>name==='authorization'?options.headers.Authorization:''},
        {json:body=>{output=body;return body;}},error=>{failure=error;});
      return failure?Response.json({success:false,error:{code:failure.code,message:failure.message}},{status:failure.statusCode}):Response.json(output);
    }
    const url=new URL(value);
    assert.equal(url.origin,'http://chatwoot.local');assert.equal(options.method,'GET');provider.push(url.pathname+url.search);
    if(url.pathname==='/api/v1/accounts/2/conversations/1/messages'){
      const before=url.searchParams.get('before')||'';assert(pages.has(before));
      return Response.json({payload:pages.get(before)});
    }
    assert.equal(url.pathname,'/api/v1/accounts/2/conversations/1');
    return Response.json({id:1,inbox_id:1,status:'open',meta:{sender:{name:'Synthetic history contact',phone_number:'+18880000001'},assignee:{id:7,name:'Synthetic staff'}}});
  };
  const initial=(await liveApi.conversation(token,'1')).conversation;
  assert.equal(initial.messages.length,20);assert.deepEqual(initial.history,{nextBefore:21,hasMore:true});
  let cursor=initial.history.nextBefore;
  const publicIds=[];
  for(const expected of [18,16,15,null]){
    const {conversation}=await liveApi.conversation(token,'1',{before:cursor,historyScope:initial});
    assert.equal(conversation.id,'1');assert.deepEqual(conversation.history,{nextBefore:expected,hasMore:expected!==null});
    assert.equal(Object.hasOwn(conversation.history,'total'),false);
    for(const message of conversation.messages){assert.doesNotMatch(message.text,/hidden/);publicIds.push(message.id);}
    if(expected===18)assert.equal(conversation.messages[0].attachments[0].type,'image');
    if(expected===16)assert.equal(conversation.messages.length,0);
    if(expected===15)assert.equal(conversation.messages[0].attachments[0].mimeType,'application/pdf');
    cursor=expected;
  }
  assert.deepEqual(publicIds,['18','15']);
  assert.deepEqual(requests,['','?before=21','?before=18','?before=16','?before=15']);
  assert.equal(provider.length,15);assert.equal(provider.filter(path=>path.includes('/messages')).length,5);
});
