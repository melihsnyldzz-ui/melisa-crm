// Deployment policy is independent of browser consent. Neither can enable sends.
export function assertPaidAiAllowed(intent, environment = process.env) {
  if (environment.CRM_ISOLATED_PREPARATION === 'true' || environment.CRM_PAID_AI_ENABLED !== 'true') {
    throw Object.assign(new Error('Ücretli AI işlemleri bu ortamda kapalı.'), {code:'AI_PAID_DISABLED',statusCode:403});
  }
  if (!intent || intent.userInitiated !== true || !['manual','automatic-opt-in'].includes(intent.action)) {
    throw Object.assign(new Error('Bu AI işlemi için açık kullanıcı seçimi gerekiyor.'), {code:'AI_USER_ACTION_REQUIRED',statusCode:403});
  }
}
