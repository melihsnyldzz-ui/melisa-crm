import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { translateConversationText } from './translationService.js';

const conversation = {
  messages: [
    { direction: 'incoming', text: 'Hello, do you have this in blue?' },
    { direction: 'outgoing', text: 'Kontrol ediyorum.' },
  ],
};

function captureConfig() {
  return { ...env.translation };
}

test('translation fails closed when OPENAI_API_KEY is absent', async () => {
  const original = captureConfig();
  let fetchCalled = false;
  env.translation.apiKey = '';
  try {
    await assert.rejects(
      () => translateConversationText({ conversation, mode: 'incoming_to_tr' }, {
        fetch: async () => { fetchCalled = true; },
      }),
      (error) => error.code === 'WHATSAPP_CRM_TRANSLATION_DISABLED' && error.statusCode === 503,
    );
    assert.equal(fetchCalled, false);
  } finally {
    Object.assign(env.translation, original);
  }
});

test('incoming_to_tr keeps original, translation and back translation together', async () => {
  const original = captureConfig();
  env.translation.apiKey = 'test-openai-key';
  env.translation.model = 'gpt-4o-mini';
  env.translation.maxTextLength = 2000;
  try {
    const result = await translateConversationText({ conversation, mode: 'incoming_to_tr' }, {
      fetch: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.store, false);
        assert.equal(body.text.format.type, 'json_schema');
        return {
          ok: true,
          json: async () => ({
            output: [{
              content: [{
                type: 'output_text',
                text: JSON.stringify({
                  detectedLanguage: 'en',
                  targetLanguage: 'tr',
                  translatedText: 'Merhaba, bunun mavisi var mi?',
                  backTranslation: 'Hello, do you have this in blue?',
                  confidence: 0.99,
                  warning: '',
                }),
              }],
            }],
          }),
        };
      },
    });
    assert.equal(result.originalText, 'Hello, do you have this in blue?');
    assert.equal(result.targetLanguage, 'tr');
    assert.equal(result.autoSend, false);
    assert.equal(result.model, 'gpt-4o-mini');
  } finally {
    Object.assign(env.translation, original);
  }
});

test('outgoing_from_tr honors an explicit target language', async () => {
  const original = captureConfig();
  env.translation.apiKey = 'test-openai-key';
  try {
    const result = await translateConversationText({
      conversation,
      mode: 'outgoing_from_tr',
      text: 'Evet, mavi rengi mevcut.',
      targetLanguage: 'de',
    }, {
      fetch: async (_url, options) => {
        const requestBody = JSON.parse(options.body);
        const userInput = JSON.parse(requestBody.input[1].content[0].text);
        assert.equal(userInput.requestedTargetLanguage, 'de');
        assert.deepEqual(userInput.recentIncomingMessages, []);
        return {
          ok: true,
          json: async () => ({
            output: [{ content: [{ type: 'output_text', text: JSON.stringify({
              detectedLanguage: 'en', targetLanguage: 'de',
              translatedText: 'Ja, Blau ist verfugbar.',
              backTranslation: 'Evet, mavi mevcut.', confidence: 0.95, warning: '',
            }) }] }],
          }),
        };
      },
    });
    assert.equal(result.targetLanguage, 'de');
    assert.equal(result.autoSend, false);
  } finally {
    Object.assign(env.translation, original);
  }
});

test('translation rejects text over the configured maximum before network access', async () => {
  const original = captureConfig();
  env.translation.apiKey = 'test-openai-key';
  env.translation.maxTextLength = 10;
  let fetchCalled = false;
  try {
    await assert.rejects(
      () => translateConversationText({
        conversation,
        mode: 'outgoing_from_tr',
        text: 'Bu metin siniri asiyor.',
        targetLanguage: 'en',
      }, { fetch: async () => { fetchCalled = true; } }),
      (error) => error.code === 'WHATSAPP_CRM_TRANSLATION_TEXT_TOO_LONG' && error.statusCode === 413,
    );
    assert.equal(fetchCalled, false);
  } finally {
    Object.assign(env.translation, original);
  }
});
