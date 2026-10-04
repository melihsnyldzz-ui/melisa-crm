import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FILE_BYTES, MAX_REQUEST_BYTES, ATTACHMENT_ACCEPT, attachmentMimeType, attachmentMediaLabel, prepareAttachment, validateAttachmentFile, validateFileSignature, validateSendPayload, classifySendFailure } from "../src/outboundMedia.js";
const png = {type:"image/png", size:100, name:"test.png"};
test("one-file allowlist and 3 MiB raw ceiling", () => {
  for (const type of ["image/jpeg","image/png","image/webp","application/pdf","text/plain","audio/mpeg","audio/mp4","audio/ogg","audio/wav","video/mp4"]) {
    assert.doesNotThrow(() => validateAttachmentFile({...png,type,size:MAX_FILE_BYTES}));
    assert.throws(() => validateAttachmentFile({...png,type,size:MAX_FILE_BYTES+1}));
  }
  for (const type of ["image/svg+xml","text/html","application/javascript","image/gif",""]) assert.throws(() => validateAttachmentFile({...png,type}));
  assert.throws(() => validateAttachmentFile({...png,size:MAX_FILE_BYTES+1})); assert.throws(() => validateAttachmentFile({...png,size:0}));
});

const headerFixtures = {
  "audio/mpeg": Uint8Array.from([255,251,144,0]),
  "audio/mp4": Uint8Array.from([0,0,0,24,...Buffer.from("ftypM4A "),0,0,0,0]),
  "audio/ogg": Uint8Array.from([...Buffer.from("OggS"),0,2,0,0,0,0,0,0]),
  "audio/wav": Uint8Array.from([...Buffer.from("RIFF"),20,0,0,0,...Buffer.from("WAVE")]),
  "video/mp4": Uint8Array.from([0,0,0,24,...Buffer.from("ftypisom"),0,0,0,0]),
};
test("audio/video header checks distinguish supported containers from renamed documents", () => {
  for (const [mimeType, bytes] of Object.entries(headerFixtures)) {
    assert.doesNotThrow(() => validateFileSignature(bytes,mimeType));
    assert.throws(() => validateFileSignature(Buffer.from("%PDF-1.4 not media"),mimeType));
    assert.throws(() => validateFileSignature(Buffer.from("<html>not media"),mimeType));
  }
  assert.doesNotThrow(() => validateFileSignature(Buffer.from("ID3\u0004\0\0\0\0\0\0"),"audio/mpeg"));
  assert.throws(() => validateFileSignature(Buffer.from("ID3"),"audio/mpeg"));
  assert.throws(() => validateFileSignature(headerFixtures["audio/wav"],"audio/ogg"));
  assert.throws(() => validateFileSignature(Uint8Array.from([255,224,0,0]),"audio/mpeg"));
});
test("only known picker aliases and missing media MIME types are canonicalized", () => {
  for (const [name, type, expected] of [["voice.MP3","","audio/mpeg"],["voice.m4a","audio/x-m4a","audio/mp4"],["voice.wav","audio/x-wav","audio/wav"],["voice.ogg","application/ogg","audio/ogg"],["movie.mp4","","video/mp4"]]) {
    const file={name,type,size:100};
    assert.equal(attachmentMimeType(file),expected);
    assert.doesNotThrow(()=>validateAttachmentFile(file));
  }
  for (const file of [{name:"fake.mp3",type:"text/html",size:100},{name:"fake.wav",type:"application/javascript",size:100},{name:"fake.exe",type:"audio/x-m4a",size:100},{name:"unknown.pdf",type:"",size:100}]) assert.throws(()=>validateAttachmentFile(file));
  assert.match(ATTACHMENT_ACCEPT.audio,/\.m4a/);
  assert.equal(ATTACHMENT_ACCEPT.video,"video/mp4,.mp4");
});
test("preparation retains bytes and returns canonical audio/video types rather than document", async () => {
  const original=globalThis.FileReader;
  try {
    globalThis.FileReader=class {
      readAsDataURL(file) { file.arrayBuffer().then(bytes=>{this.result=`data:${file.type || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;this.onload();}); }
    };
    for (const [mimeType, bytes] of Object.entries(headerFixtures)) {
      const file=new Blob([bytes],{type:mimeType}); file.name=`selected.${mimeType==="audio/mp4" ? "m4a" : mimeType.split("/")[1]}`;
      const media=await prepareAttachment(file);
      assert.equal(media.mimeType,mimeType);
      assert.equal(media.mediaType,mimeType.startsWith("audio/")?"audio":"video");
      assert.deepEqual(Buffer.from(media.dataUrl.split(",")[1],"base64"),Buffer.from(bytes));
      assert.doesNotThrow(()=>validateSendPayload({media,clientRequestId:"one-send"}));
      assert.throws(()=>validateSendPayload({media:{...media,mediaType:"document"}}),{status:400});
      assert.notEqual(attachmentMediaLabel(media),"PDF belgesi");
    }
    const alias=new Blob([headerFixtures["audio/mp4"]],{type:"audio/x-m4a"}); alias.name="voice.m4a";
    const result=await prepareAttachment(alias);
    assert.equal(result.mimeType,"audio/mp4"); assert.match(result.dataUrl,/^data:audio\/mp4;base64,/);
    const emptyType=new Blob([headerFixtures["audio/wav"]]); emptyType.name="voice.wav";
    assert.equal((await prepareAttachment(emptyType)).mimeType,"audio/wav");
    // These fixtures exercise only the header/payload contract, not codec decode.
    const image=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:"image/png"}); image.name="image.png";
    assert.equal((await prepareAttachment(image)).mediaType,"image");
    const document=new Blob([Buffer.from("%PDF-1.4")],{type:"application/pdf"}); document.name="doc.pdf";
    assert.equal((await prepareAttachment(document)).mediaType,"document");
    globalThis.FileReader=class { readAsDataURL() { this.result=undefined;queueMicrotask(()=>this.onload()); } };
    await assert.rejects(()=>prepareAttachment(image),/Dosya okunamadı/);
  } finally { if(original===undefined)delete globalThis.FileReader; else globalThis.FileReader=original; }
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

test("audio/video sends retain recipient, canonical MIME and one request identity without retries", async (t) => {
 const {liveApi}=await import("../src/liveApi.js");
 const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:{message:{id:"accepted",direction:"outgoing"}}});});
 for (const [mimeType,bytes] of Object.entries(headerFixtures)) {
  const media={dataUrl:`data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,fileName:"selected-file",mimeType,mediaType:mimeType.startsWith("audio/")?"audio":"video"};
  const requestId=`request-${calls.length}`;
  await liveApi.send("synthetic-session","selected-only","",requestId,media);
  const call=calls.at(-1);
  assert.equal(call.url,"/api/live/crm/conversations/selected-only/messages");
  assert.equal(call.options.headers.Authorization,"Bearer synthetic-session");
  assert.deepEqual(JSON.parse(call.options.body),{text:"",media,clientRequestId:requestId});
 }
 assert.equal(calls.length,5);
 t.mock.method(globalThis,"fetch",async()=>{calls.push("failed-once");throw Error("lost response");});
 const media={dataUrl:"data:audio/wav;base64,UklGRg==",mimeType:"audio/wav",mediaType:"audio",fileName:"voice.wav"};
 await assert.rejects(()=>liveApi.send("synthetic-session","selected-only","","uncertain-audio",media));
 assert.equal(calls.length,6);
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
