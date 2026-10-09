import { env } from '../config/env.js';

const TRANSLATION_MODES = new Set(['incoming_to_tr', 'outgoing_from_tr']);

function translationError(code, message, statusCode = 400, meta = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (meta) error.meta = meta;
  return error;
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLanguage(value) {
  const language = normalizedText(value).toLowerCase();
  if (!language) return '';
  if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(language)) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_LANGUAGE_INVALID',
      'targetLanguage ISO dil kodu olmali (ornegin en, de veya ar).',
      400,
    );
  }
  return language;
}

function recentIncomingTexts(conversation) {
  return (conversation?.messages || [])
    .filter((message) => ['incoming', 'in'].includes(message.direction) && normalizedText(message.text))
    .slice(-5)
    .map((message) => normalizedText(message.text).slice(0, 500));
}

function extractResponseText(payload) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

const outputSchema = {
  type: 'object',
  properties: {
    detectedLanguage: { type: 'string' },
    targetLanguage: { type: 'string' },
    translatedText: { type: 'string' },
    backTranslation: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    warning: { type: 'string' },
  },
  required: [
    'detectedLanguage',
    'targetLanguage',
    'translatedText',
    'backTranslation',
    'confidence',
    'warning',
  ],
  additionalProperties: false,
};

export async function translateConversationText({
  conversation,
  mode,
  text,
  targetLanguage,
}, dependencies = {}) {
  if (process.env.CRM_ISOLATED_PREPARATION === 'true') throw translationError('AI_PAID_DISABLED','Ücretli AI işlemleri bu ortamda kapalı.',403);
  if (!TRANSLATION_MODES.has(mode)) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_MODE_INVALID',
      'mode incoming_to_tr veya outgoing_from_tr olmali.',
      400,
    );
  }

  const incomingTexts = recentIncomingTexts(conversation);
  const originalText = mode === 'incoming_to_tr'
    ? normalizedText(text) || incomingTexts.at(-1) || ''
    : normalizedText(text);
  if (!originalText) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_TEXT_REQUIRED',
      mode === 'incoming_to_tr'
        ? 'Cevrilecek gelen mesaj bulunamadi.'
        : 'Cevrilecek Turkce metin zorunludur.',
      400,
    );
  }
  if (originalText.length > env.translation.maxTextLength) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_TEXT_TOO_LONG',
      `Ceviri metni en fazla ${env.translation.maxTextLength} karakter olabilir.`,
      413,
    );
  }

  const requestedTargetLanguage = normalizeLanguage(targetLanguage);
  if (mode === 'outgoing_from_tr' && !requestedTargetLanguage && incomingTexts.length < 1) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_TARGET_REQUIRED',
      'Musteri dili algilanamadi; targetLanguage belirtin.',
      400,
    );
  }
  if (!env.translation.apiKey) {
    throw translationError(
      'WHATSAPP_CRM_TRANSLATION_DISABLED',
      'AI ceviri kapali. OPENAI_API_KEY sunucudaki .env.local dosyasinda tanimlanmali.',
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.translation.timeoutMs);
  const fetchImpl = dependencies.fetch || fetch;
  const request = {
    mode,
    originalText,
    recentIncomingMessages: requestedTargetLanguage ? [] : incomingTexts,
    requestedTargetLanguage: requestedTargetLanguage || null,
  };

  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.translation.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.translation.model,
        store: false,
        input: [
          {
            role: 'system',
            content: [{
              type: 'input_text',
              text: [
                'You are a precise customer-service translator.',
                'Detect the customer language from the supplied recent incoming messages.',
                'incoming_to_tr defaults to Turkish; outgoing_from_tr defaults to the detected customer language.',
                'Honor requestedTargetLanguage when provided.',
                'Preserve names, numbers, product codes, URLs, tone, and meaning.',
                'backTranslation must translate translatedText back into the original input language.',
                'Do not add sales claims or information not present in the source.',
              ].join(' '),
            }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: JSON.stringify(request) }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'crm_translation',
            strict: true,
            schema: outputSchema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw translationError(
        'WHATSAPP_CRM_TRANSLATION_PROVIDER_FAILED',
        `AI ceviri servisi istegi reddetti (HTTP ${response.status}).`,
        response.status === 429 ? 429 : 502,
        { providerStatus: response.status, providerCode: 'OPENAI_RESPONSE_REJECTED' },
      );
    }

    const payload = await response.json();
    const outputText = extractResponseText(payload);
    let translated;
    try {
      translated = JSON.parse(outputText);
    } catch {
      throw translationError(
        'WHATSAPP_CRM_TRANSLATION_RESPONSE_INVALID',
        'AI ceviri servisi gecerli yapilandirilmis yanit vermedi.',
        502,
      );
    }

    return {
      originalText,
      detectedLanguage: String(translated.detectedLanguage || ''),
      targetLanguage: String(translated.targetLanguage || ''),
      translatedText: String(translated.translatedText || ''),
      backTranslation: String(translated.backTranslation || ''),
      model: env.translation.model,
      confidence: Number(translated.confidence),
      warning: String(translated.warning || ''),
      autoSend: false,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw translationError(
      error?.name === 'AbortError'
        ? 'WHATSAPP_CRM_TRANSLATION_TIMEOUT'
        : 'WHATSAPP_CRM_TRANSLATION_NETWORK_FAILED',
      error?.name === 'AbortError'
        ? 'AI ceviri servisi zaman asimina ugradi.'
        : 'AI ceviri servisine baglanilamadi.',
      error?.name === 'AbortError' ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
