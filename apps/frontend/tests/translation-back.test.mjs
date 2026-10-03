import test from "node:test";
import assert from "node:assert/strict";
import { liveApi } from "../src/liveApi.js";

test("an echoed back-translation is replaced through an explicit Turkish request, without sending", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({ data: calls.length === 1
      ? { detectedLanguage: "tr", targetLanguage: "en", translatedText: "Nice to meet you!", backTranslation: "Nice to meet you!" }
      : { detectedLanguage: "en", targetLanguage: "tr", translatedText: "Tanıştığımıza memnun oldum!" } });
  };
  try {
    const result = await liveApi.translate("test-token", "55", { mode: "outgoing_from_tr", targetLanguage: "en", text: "Memnun oldum!" });
    assert.equal(result.translatedText, "Nice to meet you!");
    assert.equal(result.backTranslation, "Tanıştığımıza memnun oldum!");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.endsWith("/translate")));
    assert.deepEqual(calls[1].body, { mode: "incoming_to_tr", text: "Nice to meet you!", targetLanguage: "tr" });
  } finally { globalThis.fetch = originalFetch; }
});

test("a failed Turkish back-translation cannot be presented as a valid preview", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { detectedLanguage: "en", targetLanguage: "en", translatedText: "Hello", backTranslation: "Hello" } });
  };
  try {
    await assert.rejects(liveApi.translate("test-token", "55", { mode: "outgoing_from_tr", targetLanguage: "en", text: "Merhaba" }), /Türkçe çeviri doğrulanamadı/);
    assert.equal(calls, 2, "translation must not retry or send on failure");
  } finally { globalThis.fetch = originalFetch; }
});

test("an existing distinct back-translation does not consume an additional request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ data: { detectedLanguage: "tr", targetLanguage: "en", translatedText: "Good morning", backTranslation: "Günaydın" } }); };
  try {
    const result = await liveApi.translate("test-token", "55", { mode: "outgoing_from_tr", targetLanguage: "en", text: "Günaydın" });
    assert.equal(result.backTranslation, "Günaydın");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
