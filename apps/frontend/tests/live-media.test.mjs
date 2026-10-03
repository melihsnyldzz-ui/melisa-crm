import assert from "node:assert/strict";
import test from "node:test";
import { applyReadReceipts, conversationRevision, mergeInboxConversations, normalizeConversation, liveApi, sessionPermissionSignals } from "../src/liveApi.js";

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
