import { env, getStartupWarnings } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { startWaapiWorker } from './services/waapiChatwootBridge.js';

const app = createApp();
const stopWaapiWorker = startWaapiWorker();

const server = app.listen(env.port, () => {
  logger.info('Melisa WhatsApp CRM API listening', {
    port: env.port,
    appName: env.appName,
    provider: env.whatsapp.provider,
    authMode: 'crm-local',
    crmUserCount: env.auth.users.length,
    sendEnabled: env.whatsapp.sendEnabled,
    testNumberOnly: env.whatsapp.testNumberOnly,
    liveSendApproved: env.whatsapp.liveSendApproved,
  });

  for (const warning of getStartupWarnings()) {
    logger.warn('WhatsApp CRM startup readiness warning', {
      category: 'startup_warning',
      warning,
    });
  }
});

function shutdown(signal) {
  stopWaapiWorker();
  logger.warn('WhatsApp CRM API shutdown requested', { signal });
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
