import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { assertMediaFormat } from './mediaFormatValidation.js';
import { normalizeOutboundMedia } from './messageMedia.js';
import { normalizeWaapiMedia, acceptWaapiWebhook } from '../services/waapiWebhookService.js';
import { validMediaBytes, fixtureMimes, validPng, pngChunk, validOffice, validMp4, validPdf, validPdfXrefStream } from './validMediaFixtures.js';
const outboundMimes=fixtureMimes.filter(mime=>!mime.startsWith('audio/')&&!mime.startsWith('video/'));
function both(bytes,mime) {
  assert.throws(()=>normalizeWaapiMedia({ mimetype:mime,data:bytes.toString('base64'),filename:'synthetic' }),e=>e.code==='WHATSAPP_CRM_WAAPI_MEDIA_REJECTED'&&e.meta.transportAttempted===false);
  if(outboundMimes.includes(mime)) assert.throws(()=>normalizeOutboundMedia({ mimeType:mime,dataUrl:'data:'+mime+';base64,'+bytes.toString('base64') }),e=>e.code==='WHATSAPP_CRM_MEDIA_FORMAT_INVALID'&&e.meta.transportAttempted===false);
}
for (const mime of fixtureMimes) {
  test('format positive: existing allowed '+mime,()=>{
    const bytes=validMediaBytes(mime); assertMediaFormat(bytes,mime);
    assert.equal(normalizeWaapiMedia({ mimetype:mime,data:bytes.toString('base64') }).byteLength,bytes.length);
    if(outboundMimes.includes(mime)) assert.equal(normalizeOutboundMedia({ dataUrl:'data:'+mime+';base64,'+bytes.toString('base64') }).byteLength,bytes.length);
  });
  if(mime!=='text/plain') {
    test('disguised HTML blocked in both applicable paths: '+mime,()=>both(Buffer.from('<!doctype html><html><script>synthetic</script></html>'),mime));
    test('truncated binary blocked in both applicable paths: '+mime,()=>both(validMediaBytes(mime).subarray(0,Math.floor(validMediaBytes(mime).length/2)),mime));
    test('appended HTML polyglot blocked: '+mime,()=>both(Buffer.concat([validMediaBytes(mime),Buffer.from('<html><script>synthetic</script></html>')]),mime));
  }
}
test('cross-format and magic-only lookalikes cannot use declared image/PDF MIME',()=>{
  both(validMediaBytes('application/pdf'),'image/png');
  both(validMediaBytes('image/png'),'application/pdf');
  for(const [mime,bytes] of [
    ['image/png',Buffer.from([137,80,78,71,13,10,26,10])],
    ['image/jpeg',Buffer.from([255,216,255,217])],
    ['application/pdf',Buffer.from('%PDF-1.4\n<html>synthetic</html>\nstartxref\n0\n%%EOF\n')],
    ['application/pdf',Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n9\n%%EOF\n')],
  ]) both(bytes,mime);
});
test('PNG validates CRC, zlib completion and decoded row length',()=>{
  const crcBad=validPng(); crcBad[20]^=1; both(crcBad,'image/png');
  const header=validPng().subarray(8,33);
  for(const data of [Buffer.from('not zlib'),deflateSync(Buffer.from([0,0])),Buffer.concat([deflateSync(Buffer.alloc(14)),Buffer.from('trailing')])]) {
    both(Buffer.concat([validPng().subarray(0,8),header,pngChunk('IDAT',data),pngChunk('IEND',Buffer.alloc(0))]),'image/png');
  }
});
test('PNG embedded HTML ancillary polyglot rejected even with recomputed CRC',()=>{
  const bytes=validPng(); both(Buffer.concat([bytes.subarray(0,-12),pngChunk('tEXt',Buffer.from('Comment\0<html><script>synthetic</script></html>')),bytes.subarray(-12)]),'image/png');
});
test('valid ZIP compressed DOCX and XLSX remain allowed; other ZIP is not Office',()=>{
  assertMediaFormat(validOffice('docx',{},true),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assertMediaFormat(validOffice('xlsx',{},true),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  both(validOffice('xlsx'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  both(validOffice('docx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
test('Office rejects bad CRC, path traversal, malformed XML and embedded active parts',()=>{
  const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const corrupt=validOffice('docx'); corrupt[14]^=1; both(corrupt,mime);
  for(const patch of [
    { '../escape.xml':'synthetic' },{ 'word/active.html':'<html>synthetic</html>' },
    { 'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:document>' },
    { 'word/document.xml':'<!DOCTYPE x [<!ENTITY foo SYSTEM "file:///synthetic">]><document/>' },
    { 'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" invalid=unquoted><w:body/></w:document>' },
    { 'word/document.xml':'<w:document xmlns:w="https://wrong.invalid"><w:body>wordprocessingml</w:body></w:document>' },
  ]) both(validOffice('docx',patch),mime);
});
test('Office bounded expansion rejects compressed bomb before large inflation',()=>{
  const bomb=validOffice('docx',{ 'word/huge.xml':Buffer.alloc(64*1024*1024+1,32) },true);
  both(bomb,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
test('MP4 handler distinguishes allowed audio and video containers',()=>{
  both(validMp4(true),'audio/mp4'); both(validMp4(false),'video/mp4');
});
test('TXT accepts UTF-8 but not binary or malformed UTF-8',()=>{
  for(const bytes of [Buffer.from([0,1,2]),Buffer.from([0xc3]),validPng()]) both(bytes,'text/plain');
});
test('PDF modern compressed xref/object streams and PNG predictor remain allowed',()=>{
  assertMediaFormat(validPdfXrefStream(),'application/pdf');
  assertMediaFormat(validPdfXrefStream(true),'application/pdf');
  assertMediaFormat(validPdf('The literal endobj is ordinary document text'),'application/pdf');
});
test('PDF invalid length, delimiters, page references and xref pointers fail closed',()=>{
  const valid=validPdf().toString('latin1');
  for(const text of [valid.replace(/\/Length \d+/,'/Length 99999'),
    valid.replace('/Type /Catalog /Pages 2 0 R >>','/Type /Catalog /Pages 2 0 R > '),
    valid.replace('/Pages 2 0 R','/Pages 9 0 R'),
    valid.replace('/Parent 2 0 R','/Parent 8 0 R'),
    valid.replace('0000000009 00000 n','0000000010 00000 n'),
  ]) { assert.notEqual(text,valid); both(Buffer.from(text,'latin1'),'application/pdf'); }
  const modern=validPdfXrefStream();
  both(Buffer.from(modern.toString('latin1').replace('/W [1 4 2]','/W [0 0 0]'),'latin1'),'application/pdf');
});
test('invalid inbound media is rejected before durable journal or provider invalidation',async()=>{
  let writes=0,invalidations=0;
  await assert.rejects(acceptWaapiWebhook({instanceId:'105185',event:'message',data:{
    message:{id:{fromMe:false,remote:'19999999999@c.us',_serialized:'false_19999999999@c.us_SYNTHETIC'},fromMe:false,from:'19999999999@c.us',body:'synthetic',hasMedia:true},
    media:{mimetype:'image/png',filename:'disguised.png',data:Buffer.from('<html>synthetic</html>').toString('base64')},
  }},{journal:{accept:async()=>{writes++;}},provider:{invalidate:()=>{invalidations++;}}}),e=>e.code==='WHATSAPP_CRM_WAAPI_MEDIA_REJECTED');
  assert.equal(writes,0); assert.equal(invalidations,0);
});
