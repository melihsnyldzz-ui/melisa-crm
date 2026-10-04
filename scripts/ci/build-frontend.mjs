import { build } from '../../apps/frontend/node_modules/vite/dist/node/index.js';

// Keep the repository Vite config and production build, disabling .env discovery.
await build({ configLoader: 'native', envDir: false });
