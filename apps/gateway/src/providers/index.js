import { env } from '../config/env.js';
import { EvolutionProvider } from './evolutionProvider.js';
import { ChatwootProvider } from './chatwootProvider.js';
import { waapiProvider } from './waapiProvider.js';

export function getWhatsAppProvider() {
  if (env.whatsapp.provider === 'waapi') return waapiProvider;
  if (env.whatsapp.provider === 'evolution') {
    return new EvolutionProvider();
  }

  if (env.whatsapp.provider === 'chatwoot') {
    return new ChatwootProvider();
  }

  const error = new Error(`Unsupported WhatsApp provider: ${env.whatsapp.provider}`);
  error.code = 'WHATSAPP_CRM_PROVIDER_UNSUPPORTED';
  error.statusCode = 503;
  throw error;
}
