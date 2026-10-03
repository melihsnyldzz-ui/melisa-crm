export class WhatsAppProvider {
  constructor(providerName) {
    this.providerName = providerName;
  }

  normalizeWebhook() {
    throw new Error('normalizeWebhook must be implemented by provider adapter');
  }

  async sendMessage() {
    const error = new Error('Outbound WhatsApp sending is not implemented by this provider');
    error.code = 'WHATSAPP_CRM_SEND_NOT_IMPLEMENTED';
    error.statusCode = 501;
    throw error;
  }
}
