import assert from "node:assert/strict";
import test from "node:test";
import { applyReadReceipts, conversationRevision, mergeInboxConversations, mergeOlderConversation, normalizeConversation, liveApi, sessionPermissionSignals } from "../src/liveApi.js";

const olderFixture=(ids,history,extra={})=>normalizeConversation({id:55,assignedUserId:7,chatwootAgentId:7,messages:ids.map(id=>({id,content:`History ${id}`,createdAt:`2026-10-13T12:00:${String(id).padStart(2,'0')}Z`})),history,...extra});

test('older history API sends canonical before with exact scope and preserves cancellation without leaking local options',async t=>{
 const scope=olderFixture([21,22],{nextBefore:21,hasMore:true}),calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({data:{conversation:olderFixture([18,20],{nextBefore:18,hasMore:true})}});});
 const controller=new AbortController(),result=await liveApi.conversation('synthetic-history',55,{before:21,historyScope:scope,signal:controller.signal});
 assert.equal(calls[0].url,'/api/live/crm/conversations/55?before=21');assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-history');assert.equal(calls[0].options.before,undefined);assert.equal(calls[0].options.historyScope,undefined);assert.deepEqual(result.conversation.history,{nextBefore:18,hasMore:true});
 let started;const ready=new Promise(resolve=>started=resolve);t.mock.method(globalThis,'fetch',async(_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Synthetic page aborted','AbortError')),{once:true});started();}));
 const cancelled=liveApi.conversation('synthetic-abort-history',55,{before:21,historyScope:scope,signal:controller.signal}),rejected=assert.rejects(cancelled,error=>error.name==='AbortError');await ready;controller.abort();await rejected;
});

test('older history API rejects noncanonical unsafe missing-scope inputs before transport',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Unexpected history transport');});const historyScope=olderFixture([21],{nextBefore:21,hasMore:true});
 for(const before of [0,-1,1.5,'01',' 21','21x',Number.MAX_SAFE_INTEGER+1,null])await assert.rejects(liveApi.conversation('synthetic-invalid-history',55,{before,historyScope}),error=>error.code==='CRM_HISTORY_PAGE_INVALID');
 for(const options of [{before:21},{before:21,historyScope:{...historyScope,id:'56'}}])await assert.rejects(liveApi.conversation('synthetic-invalid-history',55,options),error=>error.code==='CRM_HISTORY_PAGE_INVALID');
 await assert.rejects(liveApi.conversation('synthetic-invalid-history','55?before=20'),error=>error.code==='CRM_HISTORY_PAGE_INVALID');assert.equal(calls,0);
});

test('older history API rejects missing null object and oversized raw message lists before normalization',async t=>{
 const scope=olderFixture([21],{nextBefore:21,hasMore:true});let messages;
 t.mock.method(globalThis,'fetch',async()=>Response.json({data:{conversation:{id:55,assignedUserId:7,chatwootAgentId:7,history:{nextBefore:16,hasMore:true},messages}}}));
 for(const invalid of [undefined,null,{},Array.from({length:21},()=>({id:20,content:'Synthetic duplicate'}))]){
  messages=invalid;await assert.rejects(liveApi.conversation('synthetic-raw-page',55,{before:21,historyScope:scope}),error=>error.code==='CRM_HISTORY_PAGE_INVALID');
 }
 messages=[];assert.deepEqual((await liveApi.conversation('synthetic-hidden-only-page',55,{before:21,historyScope:scope})).conversation.history,{nextBefore:16,hasMore:true});
});

test('older history API fails closed on foreign assignment malformed cursor missing history nonprogress and public IDs outside page',async t=>{
 const scope=olderFixture([21],{nextBefore:21,hasMore:true});let page;t.mock.method(globalThis,'fetch',async()=>Response.json({data:{conversation:page}}));
 const base=olderFixture([20],{nextBefore:20,hasMore:true});
 for(const invalid of [{...base,id:'56'},{...base,assignedUserId:8},{...base,chatwootAgentId:8},{...base,history:undefined},{...base,history:{nextBefore:'20',hasMore:true}},{...base,history:{nextBefore:21,hasMore:true}},{...base,history:{nextBefore:null,hasMore:false}},olderFixture([21],{nextBefore:20,hasMore:true}),olderFixture([19],{nextBefore:20,hasMore:true}),olderFixture([0],{nextBefore:1,hasMore:true}),olderFixture(Array.from({length:21},(_,i)=>i+1),{nextBefore:1,hasMore:true})]){
  page=invalid;await assert.rejects(liveApi.conversation('synthetic-invalid-page',55,{before:21,historyScope:scope}),error=>error.code==='CRM_HISTORY_PAGE_INVALID');
 }
 for(const history of [{nextBefore:16,hasMore:true},{nextBefore:null,hasMore:false}]){page=olderFixture([],history);assert.deepEqual((await liveApi.conversation('synthetic-empty-page',55,{before:21,historyScope:scope})).conversation.history,history);}
 page=olderFixture([21],undefined);assert.equal((await liveApi.conversation('synthetic-legacy-detail',55)).conversation.history,undefined);
});

test('older history merge preserves loaded cursor messages and current updates through selected unselected and metadata-only refresh',()=>{
 const current=olderFixture([20,21],{nextBefore:20,hasMore:true},{name:'Current',preview:'Current preview',workflow:[{id:'current'}],capabilities:{canSend:true}});current.messages[0].text='Current 20';
 const page=olderFixture([1,20,20],{nextBefore:1,hasMore:true},{name:'Old',preview:'Old preview',workflow:[{id:'old'}],capabilities:{canSend:false}}),merged=mergeOlderConversation(current,page,21);
 assert.deepEqual(merged.messages.map(message=>message.id),['1','20','21']);assert.equal(merged.messages[1].text,'Current 20');assert.equal(merged.name,'Current');assert.equal(merged.preview,'Current preview');assert.deepEqual(merged.workflow,current.workflow);assert.deepEqual(merged.capabilities,current.capabilities);
 for(const selected of ['55','56']){const fresh=olderFixture([20,22],{nextBefore:20,hasMore:true});fresh.messages[0].text='Latest 20';const after=mergeInboxConversations([merged],[fresh],selected)[0];assert.deepEqual(after.messages.map(message=>message.id),['1','20','21','22']);assert.equal(after.messages[1].text,'Latest 20');assert.deepEqual(after.history,{nextBefore:1,hasMore:true,loadedEarlier:true});}
 const ended=mergeOlderConversation(merged,olderFixture([],{nextBefore:null,hasMore:false}),1);assert.equal(mergeInboxConversations([ended],[olderFixture([22],{nextBefore:22,hasMore:true})],'55')[0].history.hasMore,false);
 const lightweight={...olderFixture([],undefined),messagesLoaded:false,detailLoaded:false};assert.deepEqual(mergeInboxConversations([merged],[lightweight],'55')[0].history,merged.history);
 const reassigned=olderFixture([22],{nextBefore:22,hasMore:true},{assignedUserId:8});assert.deepEqual(mergeInboxConversations([merged],[reassigned],'55')[0].messages.map(message=>message.id),['22']);assert.equal(mergeInboxConversations([merged],[reassigned],'55')[0].history.loadedEarlier,undefined);
});

test("JPEG preview is shown as an image instead of raw base64 text", () => {
  const encoded = "/9j/" + Buffer.from("synthetic preview").toString("base64");
  const conversation = normalizeConversation({
    id: 55,
    contactName: "Test",
    messages: [{ id: 9, messageType: "incoming", content: encoded, attachments: [{ id: 2, fileName: "Fotoğraf", url: "https://example.org/private-image" }] }],
  });
  const [message] = conversation.messages;
  assert.equal(message.text, "");
  assert.equal(message.previewText, "Fotoğraf");
  assert.equal(message.attachments[0].type, "image");
  assert.equal(message.attachments[0].thumbnailUrl, `data:image/jpeg;base64,${encoded}`);
  assert.equal(message.attachments[0].url, "https://example.org/private-image");
});

test("ordinary text and non-image attachments remain unchanged", () => {
  const conversation = normalizeConversation({ messages: [{ content: "Merhaba", attachments: [{ type: "application/pdf", url: "https://example.org/file.pdf" }] }] });
  assert.equal(conversation.messages[0].text, "Merhaba");
  assert.equal(conversation.messages[0].attachments[0].type, "file");
});

test("audio/video received or confirmed by the server retain playable URLs and media labels", () => {
  for (const [mimeType,type,label] of [["audio/mpeg","audio","Sesli mesaj"],["audio/mp4","audio","Sesli mesaj"],["audio/ogg","audio","Sesli mesaj"],["audio/wav","audio","Sesli mesaj"],["video/mp4","video","Video"]]) {
    for (const messageType of ["incoming","outgoing"]) {
      const {messages}=normalizeConversation({messages:[{id:"media",messageType,content:"",attachments:[{type:mimeType,url:"https://example.test/protected-media",fileName:"selected-file"}]}]});
      assert.equal(messages[0].attachments[0].type,type);
      assert.equal(messages[0].attachments[0].url,"https://example.test/protected-media");
      assert.equal(messages[0].previewText,label);
      assert.equal(messages[0].direction,messageType);
    }
  }
});

test("a new outgoing message does not undo an incoming message's read state", () => {
  const conversation = { id: "55", unread: 1, lastMessageAt: "2026-09-28T17:00:00Z", preview: "Hello", messages: [
    { id: "incoming-1", direction: "incoming", createdAt: "2026-09-28T17:00:00Z" },
  ] };
  const receipt = { revision: conversationRevision(conversation) };
  const afterReply = { ...conversation, preview: "Merhaba", lastMessageAt: "2026-09-28T17:01:00Z", messages: [
    ...conversation.messages, { id: "outgoing-2", direction: "outgoing", createdAt: "2026-09-28T17:01:00Z" },
  ] };
  assert.equal(applyReadReceipts([afterReply], { "55": receipt })[0].unread, 0);
  const afterNewIncoming = { ...afterReply, unread: 1, messages: [
    ...afterReply.messages, { id: "incoming-3", direction: "incoming", createdAt: "2026-09-28T17:02:00Z" },
  ] };
  assert.equal(applyReadReceipts([afterNewIncoming], { "55": receipt })[0].unread, 1);
});

test("first-page refresh retains older pages already loaded by the user", () => {
  const pages = [{ id: "new", preview: "eski" }, { id: "older", preview: "eski mesaj" }];
  const refreshed = mergeInboxConversations(pages, [{ id: "new", preview: "yeni mesaj" }], "", null, true);
  assert.deepEqual(refreshed.map((item) => item.id), ["new", "older"]);
  assert.equal(refreshed[0].preview, "yeni mesaj");
});

test("authoritative incoming type cannot be overridden by an agent name or a different ID namespace", () => {
  const { messages } = normalizeConversation({ contactName: "Müşteri", contactId: 1, assignedUserName: "Temsilci", messages: [
    { id: 1, message_type: 0, direction: "outgoing", senderName: "Temsilci", senderId: 99, content: "Merhaba" },
    { id: 2, direction: "in", senderName: "Farklı yazılmış müşteri", senderId: 7, content: "Hello" },
    { id: 3, direction: "out", content: "Yanıt" },
    { id: 4, message_type: 2, content: "Atandı" },
  ] });
  assert.deepEqual(messages.map((item) => item.direction), ["incoming", "incoming", "outgoing", "activity"]);
});

test("fresh inbox activity is unread even while an older history is cached", () => {
  const old = { id: "55", unread: 1, lastMessageAt: "2026-09-28T17:00:00Z", preview: "old", messages: [{ id: "1", direction: "incoming", createdAt: "2026-09-28T17:00:00Z" }] };
  const receipts = { "55": { revision: conversationRevision(old) } };
  const merged = mergeInboxConversations([old], [{ id: "55", unread: 2, lastMessageAt: "2026-09-28T17:03:00Z", preview: "new", messages: [] }]);
  assert.equal(applyReadReceipts(merged, receipts)[0].unread, 2);
});

test("read state is independent of waiting for a reply", () => {
  const customerLast = normalizeConversation({ id: 1, unread: 0, messages: [{ messageType: 0, content: "Yanıt bekliyorum" }] });
  const agentLast = normalizeConversation({ id: 2, unread: 4, messages: [{ messageType: 1, content: "Yanıt verildi" }] });
  assert.equal(customerLast.waitingForReply, true);
  assert.equal(agentLast.waitingForReply, false);
});

test("selected conversation updates even when it belongs to an older inbox page", () => {
  const rows = [{ id: "recent", messages: [] }, { id: "old", messages: [{ id: "before" }] }];
  const result = mergeInboxConversations(rows, [{ id: "recent", messages: [] }], "old", { id: "old", messages: [{ id: "latest" }] }, true);
  assert.equal(result.find((item) => item.id === "old").messages[0].id, "latest");
});

test("incoming translation explicitly requests Turkish and rejects an untranslated English echo", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return Response.json({ data: { translatedText: "Hello", targetLanguage: "en", detectedLanguage: "en" } });
  });
  await assert.rejects(liveApi.translate("test", "55", { mode: "incoming_to_tr", text: "Hello" }), /Türkçe çeviri doğrulanamadı/);
  assert.equal(bodies[0].targetLanguage, "tr");
});

test("session diagnostics never expose secrets or unrecognized fields", () => {
  const result = sessionPermissionSignals({ role: "patron", token: "secret", liveSendEnabled: false, features: { sendEnabled: true, apiKey: "secret" }, permissions: { send: "false", userEmail: "private" } });
  assert.deepEqual(result, [{ name: "liveSendEnabled", value: "false" }, { name: "permissions.send", value: "false" }, { name: "features.sendEnabled", value: "true" }]);
});

test("an inbox preview cannot replace the selected conversation's loaded history", () => {
  const current = [{ id: "55", messages: [{ id: "old", createdAt: "2026-09-28T18:00:00Z" }, { id: "new", createdAt: "2026-09-28T19:00:00Z" }] }];
  const preview = [{ id: "55", messages: [{ id: "new", createdAt: "2026-09-28T19:00:00Z" }] }];
  assert.deepEqual(mergeInboxConversations(current, preview, "55")[0].messages.map((message) => message.id), ["old", "new"]);
});

test("selected history keeps earlier media and updates same-ID messages in chronological order",()=>{
 const current={id:'55',assignedUserId:7,messages:[{id:'1',createdAt:'2026-10-13T12:00:01Z',attachments:[{type:'image',url:'https://example.test/old-photo.jpg'}]},{id:'2',createdAt:'2026-10-13T12:00:02Z',text:'old',deliveryState:'sent'}]};
 const incoming={id:'55',assignedUserId:'7',messages:[{id:'3',createdAt:'2026-10-13T12:00:03Z',text:'new'},{id:'2',createdAt:'2026-10-13T12:00:02Z',text:'updated',deliveryState:'read'}]};
 const result=mergeInboxConversations([current],[incoming],'55')[0];
 assert.deepEqual(result.messages.map(message=>message.id),['1','2','3']);assert.equal(result.messages[0].attachments[0].url,'https://example.test/old-photo.jpg');assert.equal(result.messages[1].text,'updated');assert.equal(result.messages[1].deliveryState,'read');
});

test("changed assignment replaces selected history even for a lightweight metadata refresh",()=>{
 const current={id:'55',assignedUserId:7,chatwootAgentId:7,messagesLoaded:true,messages:[{id:'private-old',text:'Old assignment history'}]};
 for(const assignment of [{assignedUserId:8,chatwootAgentId:7},{assignedUserId:7,chatwootAgentId:8}])for(const messagesLoaded of [true,false]){
  const incoming={id:'55',...assignment,messagesLoaded,messages:messagesLoaded?[{id:'new-scope',text:'Fresh assignment history'}]:[]};
  const result=mergeInboxConversations([current],[incoming],'55')[0];assert.deepEqual(result.messages,incoming.messages);assert.equal(result.messagesLoaded,messagesLoaded);
 }
});
