// Authorized catalog release: the CRM-only backend and exact design-Site Origin
// are verified. Existing CRM authorization remains enforced by the gateway.
// There is no browser-side authorization toggle.
export const CATALOG_ENABLED = true;

// Enabled after the CRM-only read contract was deployed and verified.
// This flag never grants backend permission and cannot be changed by a browser.
export const CATALOG_CRM_ONLY_ENABLED = true;

// Local preparation only; activate after protected backend acceptance.
export const CATALOG_EXISTING_STOCK_ENABLED = false;
