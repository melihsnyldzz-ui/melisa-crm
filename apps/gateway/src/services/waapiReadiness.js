import { env } from '../config/env.js';
import { waapiProvider } from '../providers/waapiProvider.js';
import { waapiChatwootBridge } from './waapiChatwootBridge.js';
let check = null;
export function waapiSendReady() {
  const safety = waapiChatwootBridge.lastSafety;
  return Boolean(env.whatsapp.provider === 'waapi' && env.whatsapp.sendEnabled && env.whatsapp.liveSendApproved
    && !env.whatsapp.autoReply.enabled && env.waapi.bridgeEnabled && waapiProvider.connected()
    && safety.bridgeReady && Date.now() - Date.parse(safety.checkedAt) < 60000);
}
export async function refreshWaapiReadiness() {
  if (env.whatsapp.provider !== 'waapi') return;
  if (!check) check = (async () => {
    await waapiProvider.getStatus();
    const safety = waapiChatwootBridge.lastSafety;
    if (env.waapi.bridgeEnabled && (!safety.checkedAt || Date.now() - Date.parse(safety.checkedAt) >= 60000)) {
      await waapiChatwootBridge.assertSafe().catch(() => {});
    }
  })();
  try { await check; } finally { check = null; }
}
