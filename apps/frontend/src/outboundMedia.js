// The existing gateway takes one base64 file in JSON, not multipart upload.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"];
export function validateAttachmentFile(file) {
  if (!file || !ALLOWED_MIME_TYPES.includes(file.type)) throw new Error("Yalnız JPEG, PNG, WebP fotoğraf, PDF veya TXT seçin.");
  if (!file.size) throw new Error("Boş dosya gönderilemez.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Dosya en fazla 3 MB olabilir. Daha küçük bir dosya seçin.");
}
export function validateFileSignature(bytes, type) {
  const starts = (...expected) => expected.every((value, index) => bytes[index] === value);
  const ascii = (offset, text) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  const valid = type === "image/jpeg" ? starts(255,216,255) : type === "image/png" ? starts(137,80,78,71,13,10,26,10) : type === "image/webp" ? ascii(0,"RIFF") && ascii(8,"WEBP") : type === "text/plain" ? bytes.length > 0 && !bytes.some(b => b < 9 || b > 13 && b < 32 || b === 127) : type === "application/pdf" && ascii(0,"%PDF-");
  if (!valid) throw new Error("Dosyanın içeriği seçilen türle eşleşmiyor. Geçerli bir fotoğraf veya PDF seçin.");
}
export async function prepareAttachment(file) {
  validateAttachmentFile(file);
  validateFileSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.type);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Dosya okunamadı. Yeniden seçin."));
    reader.onabort = () => reject(new Error("Dosya okuma iptal edildi."));
    reader.readAsDataURL(file);
  });
  return { dataUrl, fileName: file.name.slice(0, 180), mimeType: file.type, mediaType: file.type.startsWith("image/") ? "image" : "document" };
}
export function validateSendPayload(payload) {
  const media = payload.media;
  if (media && (!ALLOWED_MIME_TYPES.includes(media.mimeType) || typeof media.dataUrl !== "string" || !media.dataUrl.startsWith(`data:${media.mimeType};base64,`))) throw Object.assign(new Error("Geçersiz dosya. Dosyayı yeniden seçin."), { status: 400 });
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength >= MAX_REQUEST_BYTES) throw Object.assign(new Error("Mesaj ve dosyanın toplam boyutu fazla. Daha küçük bir dosya seçin."), { status: 413 });
  return payload;
}
export function classifySendFailure(error) {
  const blocked = /SEND_DISABLED|NOT_CONNECTED|PROVIDER_NOT_READY/.test(error.code || "");
  return !blocked && (String(error.code).includes("UNCONFIRMED_NO_RETRY") || String(error.message).includes("UNCONFIRMED_NO_RETRY") || !error.status || error.status >= 500) ? "uncertain" : "failed";
}
export function selectedConversation(conversations, id) {
  return conversations.find((item) => String(item.id) === String(id)) || null;
}
export function attachmentStatusText(attachment, sendState, uncertain) {
  if (attachment?.state === "reading") return "Önizleme hazırlanıyor…";
  if (attachment?.error) return attachment.error;
  if (sendState?.state === "sending") return "Yükleniyor ve gönderiliyor…";
  if (uncertain || sendState?.state === "uncertain") return "Teslim durumu belirsiz · yeniden gönderim kilitli";
  if (sendState?.state === "failed") return "Gönderim başarısız · dosya korunuyor";
  return "Gönderilmedi";
}
export function createSendSessionScope() {
  let epoch = 0;
  return { capture: () => epoch, invalidate: () => { epoch += 1; }, isCurrent: (value) => value === epoch };
}
export function interruptedSendStates(states) {
  return Object.fromEntries(Object.entries(states).map(([id, value]) => [id, value?.state === "sending" ? { state: "uncertain", text: "Oturum kesildi. Teslim durumu belirsiz; yeniden gönderim kilitlendi." } : value]));
}
