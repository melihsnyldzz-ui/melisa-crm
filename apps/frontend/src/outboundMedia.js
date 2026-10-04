// The existing gateway takes one base64 file in JSON, not multipart upload.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "video/mp4"];
export const ATTACHMENT_ACCEPT = {
  image: "image/jpeg,image/png,image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  audio: "audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav",
  video: "video/mp4,.mp4",
};
export function attachmentMimeType(file) {
  const type = file?.type || "";
  if (ALLOWED_MIME_TYPES.includes(type)) return type;
  // Windows file pickers can omit these types or use legacy audio aliases.
  // The header check below and the server's full format validation still apply.
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  const aliases = { mp3: ["audio/mpeg", "audio/mp3"], m4a: ["audio/mp4", "audio/x-m4a"], ogg: ["audio/ogg", "application/ogg"], wav: ["audio/wav", "audio/x-wav", "audio/wave"], mp4: ["video/mp4"] };
  const accepted = aliases[extension];
  return accepted && (!type || accepted.includes(type)) ? accepted[0] : type;
}
export function attachmentMediaType(mimeType) {
  return mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : mimeType.startsWith("video/") ? "video" : "document";
}
export function attachmentMediaLabel(media) {
  return media?.mediaType === "image" ? "Fotoğraf" : media?.mediaType === "audio" ? "Ses dosyası" : media?.mediaType === "video" ? "Video" : media?.mimeType === "text/plain" ? "TXT dosyası" : "PDF belgesi";
}
export function validateAttachmentFile(file) {
  if (!file || !ALLOWED_MIME_TYPES.includes(attachmentMimeType(file))) throw new Error("JPEG, PNG, WebP, PDF, TXT, MP3, M4A, OGG, WAV veya MP4 seçin.");
  if (!file.size) throw new Error("Boş dosya gönderilemez.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Dosya en fazla 3 MB olabilir. Daha küçük bir dosya seçin.");
}
export function validateFileSignature(bytes, type) {
  const starts = (...expected) => expected.every((value, index) => bytes[index] === value);
  const ascii = (offset, text) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  // This is only a quick header check; it does not prove codec playback or full validity.
  const mpegFrame = bytes.length >= 4 && bytes[0] === 255 && (bytes[1] & 224) === 224 && ((bytes[1] >> 3) & 3) !== 1 && ((bytes[1] >> 1) & 3) !== 0 && (bytes[2] >> 4) > 0 && (bytes[2] >> 4) < 15 && ((bytes[2] >> 2) & 3) !== 3;
  const mp4Header = bytes.length >= 16 && ascii(4, "ftyp");
  const valid = type === "image/jpeg" ? starts(255,216,255) : type === "image/png" ? starts(137,80,78,71,13,10,26,10) : type === "image/webp" ? ascii(0,"RIFF") && ascii(8,"WEBP") : type === "text/plain" ? bytes.length > 0 && !bytes.some(b => b < 9 || b > 13 && b < 32 || b === 127) : type === "application/pdf" ? ascii(0,"%PDF-") : type === "audio/wav" ? ascii(0,"RIFF") && ascii(8,"WAVE") : type === "audio/ogg" ? ascii(0,"OggS") && bytes[4] === 0 : type === "audio/mpeg" ? bytes.length >= 10 && ascii(0,"ID3") || mpegFrame : ["audio/mp4", "video/mp4"].includes(type) && mp4Header;
  if (!valid) throw new Error("Dosyanın içeriği seçilen türle eşleşmiyor. Geçerli bir fotoğraf, belge, ses veya video dosyası seçin.");
}
export async function prepareAttachment(file) {
  validateAttachmentFile(file);
  const mimeType = attachmentMimeType(file);
  validateFileSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), mimeType);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Dosya okunamadı. Yeniden seçin."));
    reader.onabort = () => reject(new Error("Dosya okuma iptal edildi."));
    reader.readAsDataURL(file);
  });
  // FileReader uses the platform's MIME alias, so send the canonical MIME in both fields.
  const encoded = typeof dataUrl === "string" && dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
  if (!encoded) throw new Error("Dosya okunamadı. Yeniden seçin.");
  return { dataUrl: `data:${mimeType};base64,${encoded}`, fileName: file.name.slice(0, 180), mimeType, mediaType: attachmentMediaType(mimeType) };
}
export function validateSendPayload(payload) {
  const media = payload.media;
  if (media && (!ALLOWED_MIME_TYPES.includes(media.mimeType) || typeof media.dataUrl !== "string" || !media.dataUrl.startsWith(`data:${media.mimeType};base64,`) || media.mediaType !== attachmentMediaType(media.mimeType))) throw Object.assign(new Error("Geçersiz dosya. Dosyayı yeniden seçin."), { status: 400 });
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
