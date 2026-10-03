import { chatwootApiRequest } from './chatwootApiService.js';

function messageProviderIds(message = {}) {
  return [
    message.source_id,
    message.content_attributes?.provider_message_id,
    message.content_attributes?.wa_message_id,
    message.content_attributes?.external_id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

export async function verifyChatwootOutboundProof({ conversationId, providerMessageId }) {
  const expected = String(providerMessageId || '').trim();
  if (!expected) return { confirmed: false, reason: 'provider-message-id-missing' };

  const response = await chatwootApiRequest(`/conversations/${conversationId}/messages`);
  const messages = response?.payload || [];
  const match = messages.find((message) => (
    Number(message.message_type) === 1 && messageProviderIds(message).includes(expected)
  ));

  if (!match) return { confirmed: false, reason: 'chatwoot-provider-id-not-found' };
  return {
    confirmed: true,
    chatwootMessageId: String(match.id),
    providerMessageId: expected,
    status: match.status || 'unknown',
  };
}

