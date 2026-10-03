import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FILE_BYTES, MAX_REQUEST_BYTES, validateAttachmentFile, validateFileSignature, validateSendPayload, classifySendFailure } from "../src/outboundMedia.js";
const png = {type:"image/png", size:100, name:"test.png"};
test("one-file allowlist and 3 MiB raw ceiling", () => {
  for (const type of ["image/jpeg","image/png","image/webp","application/pdf"]) assert.doesNotThrow(() => validateAttachmentFile({...png,type,size:MAX_FILE_BYTES}));
  for (const type of ["image/svg+xml","text/html","application/javascript","image/gif",""]) assert.throws(() => validateAttachmentFile({...png,type}));
  assert.throws(() => validateAttachmentFile({...png,size:MAX_FILE_BYTES+1})); assert.throws(() => validateAttachmentFile({...png,size:0}));
});
test("MIME signature cannot be faked by changing extension", () => {
 assert.doesNotThrow(()=>validateFileSignature(Uint8Array.from([137,80,78,71,13,10,26,10]),"image/png"));
 assert.doesNotThrow(()=>validateFileSignature(new TextEncoder().encode("%PDF-1.4"),"application/pdf"));
 assert.throws(()=>validateFileSignature(new TextEncoder().encode("<html>"),"image/png"));
});
test("request counts serialized UTF-8 bytes before network", () => {
 assert.doesNotThrow(()=>validateSendPayload({text:"Merhaba",media:{dataUrl:"data:image/png;base64,"+"A".repeat(4*1024*1024),fileName:"test.png",mimeType:"image/png",mediaType:"image"},clientRequestId:"test"}));
 assert.throws(()=>validateSendPayload({text:"ş".repeat(MAX_REQUEST_BYTES/2),media:null}),{status:413});
 assert.throws(()=>validateSendPayload({media:{dataUrl:"https://example.test/photo",mimeType:"image/png"}}),{status:400});
});
test("timeouts/5xx/explicit uncertain lock; definitive denial is retryable manually", () => {
 for(const error of [{code:"CRM_REQUEST_TIMEOUT"},{status:502},{status:409,code:"UNCONFIRMED_NO_RETRY"}]) assert.equal(classifySendFailure(error),"uncertain");
 for(const error of [{status:401},{status:413},{status:429},{status:503,code:"SEND_DISABLED"},{status:409,code:"PROVIDER_NOT_READY"}]) assert.equal(classifySendFailure(error),"failed");
});

test("live media send preserves same-origin auth and idempotency contract, with no retry", async () => {
 const {liveApi}=await import("../src/liveApi.js");
 const originalFetch=globalThis.fetch; const calls=[];
 try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,data:{message:{id:"mock-send",text:"caption",direction:"outgoing"}}}),{status:200,headers:{"Content-Type":"application/json"}});};
  const media={dataUrl:"data:application/pdf;base64,JVBERi0xLjQ=",fileName:"test.pdf",mimeType:"application/pdf",mediaType:"document"};
  await liveApi.send("mock-token","synthetic-id","caption","unique-id",media);
  assert.equal(calls.length,1); assert.equal(calls[0].url,"/api/live/crm/conversations/synthetic-id/messages");
  assert.equal(calls[0].options.headers.Authorization,"Bearer mock-token"); assert.equal(calls[0].options.method,"POST");
  assert.deepEqual(JSON.parse(calls[0].options.body),{text:"caption",media,clientRequestId:"unique-id"});
  globalThis.fetch=async()=>{calls.push("network-failure");throw new Error("connection reset");};
  await assert.rejects(()=>liveApi.send("mock-token","synthetic-id","","unique-failure",media));
  assert.equal(calls.length,2);
 } finally {globalThis.fetch=originalFetch;}
});

test("a removed selected recipient never falls back to another customer", async () => {
 const {selectedConversation}=await import('../src/outboundMedia.js');
 assert.equal(selectedConversation([{id:'A'},{id:'B'}],'A').id,'A');
 assert.equal(selectedConversation([{id:'B'}],'A'),null);
 assert.equal(selectedConversation([{id:'B'}],''),null);
});
test("logout or account replacement invalidates success, error and finalization ownership", async () => {
 const {createSendSessionScope}=await import('../src/outboundMedia.js');
 const scope=createSendSessionScope();const old=scope.capture();assert.equal(scope.isCurrent(old),true);
 scope.invalidate();const replacement=scope.capture();assert.equal(scope.isCurrent(old),false);assert.equal(scope.isCurrent(replacement),true);
 scope.invalidate();assert.equal(scope.isCurrent(replacement),false);
});
test("unknown media delivery is never labeled not sent", async () => {
 const {attachmentStatusText}=await import('../src/outboundMedia.js');
 assert.equal(attachmentStatusText({state:'ready'},null,false),'Gönderilmedi');
 assert.match(attachmentStatusText({state:'ready'},{state:'sending'},true),/Yükleniyor/);
 assert.match(attachmentStatusText({state:'ready'},{state:'uncertain'},true),/belirsiz/);
 assert.match(attachmentStatusText({state:'ready'},null,true),/belirsiz/);
});

test("session interruption changes pending upload to unknown, preserving other outcomes", async () => {
 const {interruptedSendStates,attachmentStatusText}=await import('../src/outboundMedia.js');
 const before={A:{state:'sending'},B:{state:'sent'},C:{state:'failed'}};const after=interruptedSendStates(before);
 assert.equal(after.A.state,'uncertain');assert.match(attachmentStatusText({state:'ready'},after.A,true),/belirsiz/);
 assert.equal(after.B.state,'sent');assert.equal(after.C.state,'failed');assert.equal(before.A.state,'sending');
});
