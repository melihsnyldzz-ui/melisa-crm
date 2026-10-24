import { build } from '../../apps/frontend/node_modules/vite/dist/node/index.js';

const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 1 || args[0] !== '--profile=clean-synthetic-20261022') {
    throw new Error('Unsupported frontend build profile');
  }
  // The guard first removes all ambient credentials and VITE_* overrides.
  // Apply only these fixed, non-secret TEST flags after that cleanup.
  await import('./offline-guard.mjs');
  Object.assign(process.env, {
    VITE_CRM_TEST:'1',
    VITE_CRM_ISOLATED_PREPARATION:'1',
    VITE_CRM_CLEAN_SYNTHETIC_TEST:'1',
    VITE_ERP_ORDER_TEST_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',
  });
}

// Keep the repository Vite config and production build, disabling .env discovery.
await build({ configLoader: 'native', envDir: false });
