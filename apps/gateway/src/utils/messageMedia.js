import { assertMediaFormat } from './mediaFormatValidation.js';
export const MAX_MESSAGE_MEDIA_BYTES = 10 * 1024 * 1024;
const extensions = new Map([
  ['image/jpeg', ['jpg', 'jpeg']], ['image/png', ['png']], ['image/gif', ['gif']], ['image/webp', ['webp']],
  ['application/pdf', ['pdf']], ['text/plain', ['txt']],
  ['application/msword', ['doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
  ['audio/mpeg', ['mp3']], ['audio/mp4', ['m4a', 'mp4']], ['audio/ogg', ['ogg', 'opus']], ['audio/wav', ['wav']],
  ['video/mp4', ['mp4']],
]);
function invalid(code = 'MEDIA_INVALID') {
  return Object.assign(new Error('Mesaj dosyasi gecersiz veya desteklenmiyor.'), {
    code: `WHATSAPP_CRM_${code}`, statusCode: 400, meta: { transportAttempted: false },
  });
}
export function decodeCanonicalBase64(data, maxBytes = MAX_MESSAGE_MEDIA_BYTES) {
  if (typeof data === 'string' && data.length > Math.ceil(maxBytes / 3) * 4) throw invalid('MEDIA_TOO_LARGE');
  if (typeof data !== 'string' || !data.length
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw invalid();
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.toString('base64') !== data) throw invalid();
  if (bytes.length > maxBytes) throw invalid('MEDIA_TOO_LARGE');
  return bytes;
}
export function normalizeOutboundMedia(media) {
  if (media == null || (typeof media === 'object' && !Array.isArray(media) && !Object.keys(media).length)) return null;
  if (typeof media !== 'object' || Array.isArray(media)) throw invalid();
  const dataUrl = typeof media.dataUrl === 'string' ? media.dataUrl.trim() : '';
  if (dataUrl.length > Math.ceil(MAX_MESSAGE_MEDIA_BYTES / 3) * 4 + 160) throw invalid('MEDIA_TOO_LARGE');
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) throw invalid();
  const mimeType = match[1].trim().toLowerCase();
  if (!extensions.has(mimeType)) throw invalid('MEDIA_UNSUPPORTED');
  if (media.mimeType && String(media.mimeType).trim().toLowerCase() !== mimeType) throw invalid('MEDIA_MIME_MISMATCH');
  const bytes = decodeCanonicalBase64(match[2]);
  assertMediaFormat(bytes, mimeType);
  if (media.asDocument !== undefined && typeof media.asDocument !== 'boolean') throw invalid();
  const nativeType = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'document';
  const asDocument = media.asDocument === true || nativeType === 'document' || mimeType === 'image/webp';
  const mediaType = asDocument ? 'document' : nativeType;
  let fileName = String(media.fileName || `attachment.${extensions.get(mimeType)[0]}`)
    .replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 120);
  const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && !extensions.get(mimeType).includes(extension)) throw invalid('MEDIA_FILENAME_MISMATCH');
  if (!extension) fileName += `.${extensions.get(mimeType)[0]}`;
  return { dataUrl: `data:${mimeType};base64,${match[2]}`, mimeType, fileName, mediaType, asDocument, byteLength: bytes.length };
}
export function mediaForJournal(media) {
  return media ? { mimeType: media.mimeType, fileName: media.fileName,
    data: media.dataUrl.slice(media.dataUrl.indexOf(',') + 1), byteLength: media.byteLength } : null;
}
