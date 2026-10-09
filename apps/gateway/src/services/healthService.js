import { env } from '../config/env.js';
import { outboundAttemptStore } from './outboundAttemptService.js';
import { waapiProvider } from '../providers/waapiProvider.js';
import { waapiChatwootBridge } from './waapiChatwootBridge.js';
import { refreshWaapiReadiness, waapiSendReady } from './waapiReadiness.js';

export async function getHealth() {
  if (process.env.CRM_ISOLATED_PREPARATION === 'true') return {status:'ok',appName:env.appName,authMode:'crm-local',provider:'disabled-preparation',providerConnected:false,sendReady:false,bridgeReady:false,translationEnabled:false,sendEnabled:false,outboundIdempotency:outboundAttemptStore.backend};
  await refreshWaapiReadiness();
  const providerStatus = env.whatsapp.provider === 'waapi' ? await waapiProvider.getStatus()
    : { provider: env.whatsapp.provider, providerConnected: false, checkedAt: null };
  const safety = waapiChatwootBridge.lastSafety;
  const bridgeReady = safety.bridgeReady && Date.now() - Date.parse(safety.checkedAt) < 60000;
  return {
    ...providerStatus,
    sendReady: waapiSendReady(),
    bridgeReady,
    status: 'ok',
    appName: env.appName,
    authMode: 'crm-local',
    translationEnabled: Boolean(env.translation.apiKey),
    sendEnabled: Boolean(env.whatsapp.sendEnabled),
    outboundIdempotency: outboundAttemptStore.backend,
  };
}
