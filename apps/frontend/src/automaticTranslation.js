export function nextIncomingTranslation(messages = [], results = {}, conversationId) {
  return messages.slice(-3).find(message => message.direction === 'incoming'
    && typeof message.text === 'string' && message.text.trim()
    && message.text.length <= 2000 && !results[`${conversationId}:${message.id}`]);
}
