import { salesError } from './policy.mjs';

/** Explicitly invoked server-side only. Credentials and raw provider errors are never returned. */
export function createSalesGenerator({ apiKey, model, timeoutMs = 20_000, signal }, fetchImpl = globalThis.fetch) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof model !== 'string' || !model.trim()) {
    throw salesError('AI_SALES_NOT_CONFIGURED', 503);
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || typeof fetchImpl !== 'function') {
    throw salesError('AI_SALES_CONFIG_INVALID', 503);
  }
  return async ({ instructions, schema, context }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, max_output_tokens: 3000,
          input: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(context) }],
          text: { format: { type: 'json_schema', name: 'melisa_sales_draft', strict: true, schema } } }),
      });
      if (!response.ok) throw salesError('AI_SALES_PROVIDER_FAILED', response.status === 429 ? 429 : 502);
      const payload = await response.json();
      if (payload.status !== 'completed' || !Array.isArray(payload.output)) throw salesError('AI_SALES_INCOMPLETE', 502);
      const content = payload.output.filter(item => item.type === 'message').flatMap(item => item.content || []);
      if (content.some(item => item.type === 'refusal')) throw salesError('AI_SALES_REFUSED', 502);
      const text = content.filter(item => item.type === 'output_text').map(item => item.text).join('');
      if (!text || text.length > 20_000) throw salesError('AI_SALES_RESPONSE_INVALID', 502);
      try { return JSON.parse(text); } catch { throw salesError('AI_SALES_RESPONSE_INVALID', 502); }
    } catch (error) {
      if (signal?.aborted) throw salesError('AI_SALES_CANCELLED', 499);
      if (typeof error?.code === 'string' && error.code.startsWith('AI_')) throw error;
      throw salesError(error?.name === 'AbortError' ? 'AI_SALES_TIMEOUT' : 'AI_SALES_NETWORK_FAILED', error?.name === 'AbortError' ? 504 : 502);
    } finally { clearTimeout(timeout); }
  };
}
