// CI receives only machine/tooling settings, never application credentials.
export function cleanEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) =>
    !/(TOKEN|SECRET|PASSWORD|API_KEY|DATABASE|^PG|SQL|WAAPI|WHATSAPP|CHATWOOT|EVOLUTION|OPENAI|REDIS|^ERP_|^CRM_|^VITE_|^DOTENV_|^NODE_OPTIONS$|^PORT$)/i.test(key)));
}
