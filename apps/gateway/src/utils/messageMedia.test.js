import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MESSAGE_MEDIA_BYTES, normalizeOutboundMedia, mediaForJournal } from './messageMedia.js';
import { validMediaBytes } from './validMediaFixtures.js';
const media = (mime, bytes, fileName) => ({ mimeType: mime, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64'), fileName });
test('media enforces exact decoded 10 MiB boundary, not encoded approximations', () => {
  assert.equal(normalizeOutboundMedia(media('text/plain', Buffer.alloc(MAX_MESSAGE_MEDIA_BYTES, 65), 'limit.txt')).byteLength, MAX_MESSAGE_MEDIA_BYTES);
  assert.throws(() => normalizeOutboundMedia(media('application/pdf', Buffer.alloc(MAX_MESSAGE_MEDIA_BYTES + 1), 'large.pdf')), e => e.code === 'WHATSAPP_CRM_MEDIA_TOO_LARGE' && e.meta.transportAttempted === false);
});
test('media rejects malformed base64, URL, active type, MIME mismatch, extension mismatch and nonboolean flags', () => {
  const valid = media('image/png', validMediaBytes('image/png'), 'sample.png');
  for (const value of [
    { ...valid, dataUrl: 'https://example.invalid/p.png' },
    { ...valid, dataUrl: 'data:image/png;base64,YR==' },
    { ...valid, dataUrl: 'data:image/png;base64,YQ' },
    { ...valid, dataUrl: 'data:image/png;base64,' },
    media('text/html', Buffer.from('<script>synthetic</script>'), 'test.html'),
    { ...valid, mimeType: 'image/jpeg' }, { ...valid, fileName: 'file.exe' }, { ...valid, asDocument: 'true' },
  ]) assert.throws(() => normalizeOutboundMedia(value), e => e.statusCode === 400 && e.meta.transportAttempted === false);
});
test('photo and original-file modes preserve exact bytes and sanitize filenames', () => {
  const bytes = validMediaBytes('image/png');
  const photo = normalizeOutboundMedia(media('image/png', bytes, '../Türkçe foto.png'));
  assert.equal(photo.mediaType, 'image'); assert.equal(photo.asDocument, false); assert(!photo.fileName.includes('/'));
  const original = normalizeOutboundMedia({ ...media('image/png', bytes, 'original.png'), asDocument: true });
  assert.equal(original.mediaType, 'document'); assert.equal(original.asDocument, true);
  assert.deepEqual(Buffer.from(mediaForJournal(original).data, 'base64'), bytes);
  for (const mime of ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/webp']) {
    assert.equal(normalizeOutboundMedia(media(mime, validMediaBytes(mime))).asDocument, true);
  }
});

for (const [mime, extension, type] of [
  ['audio/mpeg', 'mp3', 'audio'], ['audio/mp4', 'm4a', 'audio'], ['audio/ogg', 'ogg', 'audio'], ['audio/wav', 'wav', 'audio'], ['video/mp4', 'mp4', 'video'],
]) {
  test('outbound ' + mime + ' keeps native type and exact bytes unless explicit document mode is requested', () => {
    const bytes = validMediaBytes(mime);
    const native = normalizeOutboundMedia(media(mime, bytes));
    assert.equal(native.mediaType, type); assert.equal(native.asDocument, false);
    assert.equal(native.fileName, 'attachment.' + extension);
    assert.deepEqual(Buffer.from(mediaForJournal(native).data, 'base64'), bytes);
    const document = normalizeOutboundMedia({ ...media(mime, bytes, '../Türkçe medya.' + extension), asDocument: true });
    assert.equal(document.mediaType, 'document'); assert.equal(document.asDocument, true);
    assert(!document.fileName.includes('/'));
    assert.deepEqual(Buffer.from(mediaForJournal(document).data, 'base64'), bytes);
  });
  test('outbound ' + mime + ' rejects truncated or disguised content before transport', () => {
    const bytes = validMediaBytes(mime);
    for (const invalidBytes of [bytes.subarray(0, Math.floor(bytes.length / 2)), Buffer.from('<html><script>synthetic</script></html>')]) {
      assert.throws(() => normalizeOutboundMedia(media(mime, invalidBytes, 'synthetic.' + extension)),
        e => e.code === 'WHATSAPP_CRM_MEDIA_FORMAT_INVALID' && e.meta.transportAttempted === false);
    }
  });
}
test('audio/video MIME and filename cannot disguise the other MP4 handler or a different audio format', () => {
  for (const [mime, otherMime, fileName] of [['audio/mp4', 'video/mp4', 'sound.m4a'], ['video/mp4', 'audio/mp4', 'clip.mp4'], ['audio/mpeg', 'audio/wav', 'sound.mp3']]) {
    assert.throws(() => normalizeOutboundMedia(media(mime, validMediaBytes(otherMime), fileName)), e => e.code === 'WHATSAPP_CRM_MEDIA_FORMAT_INVALID');
  }
  const audio = media('audio/ogg', validMediaBytes('audio/ogg'), 'sound.opus');
  assert.equal(normalizeOutboundMedia(audio).mediaType, 'audio');
  assert.throws(() => normalizeOutboundMedia({ ...audio, mimeType: 'audio/mp4' }), e => e.code === 'WHATSAPP_CRM_MEDIA_MIME_MISMATCH');
  assert.throws(() => normalizeOutboundMedia({ ...audio, fileName: 'sound.mp4' }), e => e.code === 'WHATSAPP_CRM_MEDIA_FILENAME_MISMATCH');
  assert.throws(() => normalizeOutboundMedia({ ...audio, asDocument: 'false' }), e => e.code === 'WHATSAPP_CRM_MEDIA_INVALID');
});
test('audio/video retain the decoded 10 MiB limit before structural parsing', () => {
  const oversized = Buffer.alloc(MAX_MESSAGE_MEDIA_BYTES + 1);
  for (const [mime, fileName] of [['audio/wav', 'large.wav'], ['video/mp4', 'large.mp4']]) {
    assert.throws(() => normalizeOutboundMedia(media(mime, oversized, fileName)), e => e.code === 'WHATSAPP_CRM_MEDIA_TOO_LARGE' && e.meta.transportAttempted === false);
  }
});
