import test from "node:test";
import assert from "node:assert/strict";
import { ChatwootClient } from "../server/chatwoot.mjs";
import { normalizeConversation, normalizeInbox } from "../server/normalize.mjs";
import { authenticate, createRateLimiter } from "../server/security.mjs";
import { validateConfig } from "../server/config.mjs";

const config = {
  chatwootBaseUrl: "http://chatwoot.test",
  chatwootAccountId: 2,
  chatwootInboxId: 7,
  chatwootToken: "secret-token",
  requestTimeoutMs: 1000,
};

test("Chatwoot conversation request uses server token and account scope", async () => {
  let captured;
  const client = new ChatwootClient(config, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ data: { payload: [] } }), { status: 200 });
  });
  await client.listConversations({ status: "open", assigneeType: "all", page: 1 });
  assert.match(captured.url, /accounts\/2\/conversations/);
  assert.match(captured.url, /inbox_id=7/);
  assert.equal(captured.options.headers.api_access_token, "secret-token");
});

test("Outgoing message requires Chatwoot application API payload", async () => {
  let body;
  const client = new ChatwootClient(config, async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 91, content: body.content, message_type: 1 }), { status: 200 });
  });
  await client.sendText(55, "Pilot mesajı");
  assert.deepEqual(body, { content: "Pilot mesajı", message_type: "outgoing", private: false, content_type: "text" });
});

test("Conversation normalization preserves assignment and messages", () => {
  const normalized = normalizeConversation({
    id: 55, status: "open", inbox_id: 7, unread_count: 1,
    meta: { sender: { name: "Semih Ş", phone_number: "+905300000000" }, assignee: { id: 4, name: "Müdür" } },
    messages: [{ id: 1, content: "MELISA CRM TEST", message_type: 0, created_at: 1790322000 }],
  }, true);
  assert.equal(normalized.name, "Semih Ş");
  assert.equal(normalized.owner, "Müdür");
  assert.equal(normalized.messages[0].direction, "incoming");
});

test("Conversation normalization recognizes outgoing Chatwoot variants", () => {
  const normalized = normalizeConversation({
    id: 57,
    messages: [
      { id: 1, content: "string one", message_type: "1" },
      { id: 2, content: "camel case", messageType: 1 },
      { id: 3, content: "agent sender", sender: { type: "User" } },
    ],
  }, true);
  assert.deepEqual(normalized.messages.map((message) => message.direction), ["outgoing", "outgoing", "outgoing"]);
});

test("Conversation normalization preserves Chatwoot image attachments", () => {
  const normalized = normalizeConversation({
    id: 56,
    messages: [{
      id: 2, content: "", message_type: 0, created_at: 1790322000,
      attachments: [{ id: 90, file_type: "image", data_url: "https://media.example.test/photo.jpg", thumb_url: "https://media.example.test/photo-thumb.jpg", file_size: 204800 }],
    }],
  }, true);
  assert.equal(normalized.messages[0].text, "");
  assert.equal(normalized.messages[0].previewText, "Fotoğraf");
  assert.deepEqual(normalized.messages[0].attachments[0], {
    id: "90", type: "image", url: "https://media.example.test/photo.jpg", thumbnailUrl: "https://media.example.test/photo-thumb.jpg",
    fileName: "", mimeType: "", fileSize: 204800, width: null, height: null,
  });
});

test("Inbox summary counts unassigned and unread", () => {
  const result = normalizeInbox({ data: { payload: [
    { id: 1, unread_count: 2, meta: { sender: { name: "A" }, assignee: null } },
    { id: 2, unread_count: 0, meta: { sender: { name: "B" }, assignee: { id: 3, name: "Müdür" } } },
  ] } });
  assert.equal(result.summary.unassigned, 1);
  assert.equal(result.summary.unread, 2);
});

test("Role keys use constant-time comparison and stay separate", () => {
  const authConfig = { managerAccessKey: "manager-key-123456", ownerAccessKey: "owner-key-12345678" };
  assert.equal(authenticate({ headers: { authorization: "Bearer manager-key-123456" } }, authConfig).role, "manager");
  assert.equal(authenticate({ headers: { authorization: "Bearer owner-key-12345678" } }, authConfig).role, "owner");
  assert.equal(authenticate({ headers: { authorization: "Bearer wrong" } }, authConfig), null);
});

test("Write rate limiter blocks requests above the limit", () => {
  const allow = createRateLimiter({ limit: 2, windowMs: 60000 });
  assert.equal(allow("ip:send"), true);
  assert.equal(allow("ip:send"), true);
  assert.equal(allow("ip:send"), false);
});

test("Configuration refuses short or shared access keys", () => {
  const errors = validateConfig({
    chatwootBaseUrl: "http://chatwoot.test", chatwootAccountId: 2, chatwootToken: "token",
    managerAccessKey: "short", ownerAccessKey: "short",
  });
  assert.ok(errors.length >= 3);
});
