import { waapiJournal } from './waapiJournal.js';

export async function enrichWaapiReceipt(message, source, journal = waapiJournal) {
  if (source.content_attributes?.provider !== 'waapi' || message.direction !== 'outgoing') return message;
  const providerMessageId = source.source_id || source.content_attributes?.provider_message_id;
  let ack = null;
  try {
    const evidence = await journal.get('state', journal.key(`ack:${providerMessageId}`));
    ack = evidence?.providerMessageId === providerMessageId ? evidence.ack : null;
  } catch { /* unknown is never delivered */ }
  const delivered = Number.isInteger(ack) && ack >= 2;
  const read = Number.isInteger(ack) && ack >= 3;
  return { ...message, status: read ? 'read' : delivered ? 'delivered' : ack === -1 ? 'failed' : 'accepted',
    delivery: { providerAccepted: true, chatwootRecorded: true, delivered, read, ack } };
}
