import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";
import {
  applyReadReceipts, conversationRevision, effectiveInboxSummary, mergeInboxConversations,
  normalizeConversation, normalizeInboxPayload, normalizePermissions, normalizeTranslationResponse,
} from "../src/liveApi.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("serves the root HTML asset for an app route without an index.html canonical redirect", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/" ? "app" : "missing", {
            status: url.pathname === "/" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("proxies only the approved live CRM surface", async () => {
  const calls = [];
  const env = {
    CRM_API_BASE_URL: "https://crm-api.example.test",
    CRM_API_FETCH: async (request) => {
      calls.push({ url: request.url, authorization: request.headers.get("authorization") });
      return Response.json({ success: true, data: { conversations: [] } });
    },
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  };

  const allowed = await worker.fetch(new Request("https://site.example.test/api/live/crm/inbox?page=1", {
    headers: { authorization: "Bearer short-lived-token" },
  }), env);
  assert.equal(allowed.status, 200);
  assert.deepEqual(calls, [{ url: "https://crm-api.example.test/crm/inbox?page=1", authorization: "Bearer short-lived-token" }]);

  const blocked = await worker.fetch(new Request("https://site.example.test/api/live/admin/secrets"), env);
  assert.equal(blocked.status, 404);
  assert.equal(calls.length, 1);
});

test("returns a safe error when the live CRM origin is not configured", async () => {
  const response = await worker.fetch(new Request("https://site.example.test/api/live/health"), {
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
  });
  assert.equal(response.status, 503);
});

test("normalizes the live CRM conversation contract for the desktop interface", () => {
  const conversation = normalizeConversation({
    id: 55,
    contactName: "Canlı Müşteri",
    phoneIdentity: "+96176123456",
    assignedUserId: 7,
    assignedUserName: "Temsilci",
    unread: 2,
    lastMessageAt: "2026-09-25T10:00:00.000Z",
    messages: [{ id: 1, content: "Hello", messageType: "incoming", createdAt: "2026-09-25T10:00:00.000Z" }],
  });

  assert.equal(conversation.name, "Canlı Müşteri");
  assert.equal(conversation.owner, "Temsilci");
  assert.equal(conversation.country, "Lübnan");
  assert.equal(conversation.channel, "whatsapp");
  assert.equal(conversation.preview, "Hello");
  assert.equal(conversation.messages[0].direction, "incoming");
});

test("outgoing message evidence wins over a stale incoming direction", () => {
  const conversation = normalizeConversation({
    id: 58,
    contactName: "Yön Testi",
    assignedUserName: "Ancela",
    messages: [
      { id: 1, content: "Bizden giden", direction: "incoming", messageType: 1 },
      { id: 2, content: "Agent mesajı", sender: { type: "User" } },
      { id: 3, content: "İsimden bulunan", direction: "incoming", senderName: "Ancela" },
      { id: 4, content: "Müşteri mesajı", direction: "incoming", senderName: "Yön Testi" },
    ],
  });
  assert.deepEqual(conversation.messages.map((message) => message.direction), ["outgoing", "outgoing", "outgoing", "incoming"]);
});

test("normalizes live image, video, audio and file attachments", () => {
  const conversation = normalizeConversation({
    id: 56,
    contactName: "Medya Müşterisi",
    messages: [{ id: 2, messageType: "incoming", attachments: [
      { id: 1, fileType: "image", dataUrl: "https://media.example.test/photo.jpg", thumbUrl: "https://media.example.test/thumb.jpg" },
      { id: 2, fileType: "video", dataUrl: "https://media.example.test/video.mp4" },
      { id: 3, fileType: "audio", dataUrl: "https://media.example.test/voice.ogg" },
      { id: 4, fileType: "file", dataUrl: "https://media.example.test/list.pdf", fileName: "liste.pdf", fileSize: 1024 },
    ] }],
  });
  assert.equal(conversation.messages[0].text, "");
  assert.deepEqual(conversation.messages[0].attachments.map((item) => item.type), ["image", "video", "audio", "file"]);
  assert.equal(conversation.messages[0].attachments[0].thumbnailUrl, "https://media.example.test/thumb.jpg");
  assert.equal(conversation.preview, "Fotoğraf");
});

test("derives missing inbox counts from normalized conversations", () => {
  const result = normalizeInboxPayload({ conversations: [
    { id: 1, contactName: "A", unread: 3 },
    { id: 2, contactName: "B", assignedUserName: "Temsilci", unread: 0 },
  ] });

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.unread, 3);
  assert.equal(result.summary.unassigned, 1);
  assert.equal(result.summary.pendingHumanReply, 1);
});

test("normalizes the live translation contract", () => {
  const result = normalizeTranslationResponse({
    detected_language: "tr",
    targetLanguage: "fr",
    translated_text: "Bonjour",
    back_translation: "Merhaba",
    model: "translation-model",
    confidence: 0.98,
  });

  assert.equal(result.detectedLanguage, "tr");
  assert.equal(result.targetLanguage, "fr");
  assert.equal(result.translatedText, "Bonjour");
  assert.equal(result.backTranslation, "Merhaba");
});

test("enables live sending only when role permission and server flag are both active", () => {
  assert.equal(normalizePermissions({ role: "mudur", liveSendEnabled: true }).liveSendEnabled, true);
  assert.equal(normalizePermissions({ role: "mudur", liveSendEnabled: false }).liveSendEnabled, false);
  assert.equal(normalizePermissions({ role: "personel", liveSendEnabled: true }).liveSendEnabled, false);
});

test("live inbox merge adds new conversations and keeps fresh message payloads", () => {
  const current = [{ id: "1", messages: [{ id: "old" }] }];
  const incoming = [
    { id: "2", name: "Yeni müşteri", messages: [] },
    { id: "1", messages: [{ id: "new" }] },
  ];
  const merged = mergeInboxConversations(current, incoming);

  assert.deepEqual(merged.map((item) => item.id), ["2", "1"]);
  assert.equal(merged[1].messages[0].id, "new");
});

test("live inbox merge preserves loaded history when list payload omits messages", () => {
  const current = [{ id: "1", messages: [{ id: "history" }] }];
  const merged = mergeInboxConversations(current, [{ id: "1", messages: [] }]);
  assert.equal(merged[0].messages[0].id, "history");
});

test("read receipts clear the current notification but not a newer message", () => {
  const current = normalizeConversation({
    id: 55,
    unread: 2,
    lastMessageAt: "2026-09-25T10:00:00.000Z",
    messages: [{ id: 1, content: "Hello", messageType: "incoming", createdAt: "2026-09-25T10:00:00.000Z" }],
  });
  const receipts = { "55": { revision: conversationRevision(current) } };
  assert.equal(applyReadReceipts([current], receipts)[0].unread, 0);

  const updated = normalizeConversation({
    id: 55,
    unread: 1,
    lastMessageAt: "2026-09-25T10:01:00.000Z",
    messages: [
      { id: 1, content: "Hello", messageType: "incoming", createdAt: "2026-09-25T10:00:00.000Z" },
      { id: 2, content: "New", messageType: "incoming", createdAt: "2026-09-25T10:01:00.000Z" },
    ],
  });
  assert.equal(applyReadReceipts([updated], receipts)[0].unread, 1);
});

test("effective inbox summary follows locally visible unread state", () => {
  const result = effectiveInboxSummary({ total: 2, unread: 99, pendingHumanReply: 99 }, [
    { id: "1", unread: 0 },
    { id: "2", unread: 3 },
  ]);
  assert.equal(result.unread, 3);
  assert.equal(result.pendingHumanReply, 1);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
