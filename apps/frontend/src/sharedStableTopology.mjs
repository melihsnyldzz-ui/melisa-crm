// Presentation routing only. This does not create an identity or widen permissions.
export const SHARED_STABLE_ORIGIN = 'https://semih.tail295701.ts.net:8443';
export const SHARED_CRM_PREFIX = '/crm/';
export function sharedStableCrmLocation(location = globalThis.location) {
  return location?.origin === SHARED_STABLE_ORIGIN && typeof location.pathname === 'string'
    && location.pathname.startsWith(SHARED_CRM_PREFIX);
}
export function resolveCrmApiRoot(location = globalThis.location, stableBuild = false) {
  return stableBuild && sharedStableCrmLocation(location) ? '/crm/api/live' : '/api/live';
}
