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
