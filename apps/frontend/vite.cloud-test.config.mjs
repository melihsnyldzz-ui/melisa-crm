import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('.',import.meta.url));
const productionClient=path.join(root,'src/liveApi.js');
const syntheticClient=path.join(root,'src/cloudTest/api.js');

export default defineConfig({
  root,base:'/crm/',
  plugins:[{
    name:'isolated-synthetic-crm-client',enforce:'pre',
    resolveId(source,importer) {
      if (!importer || !source.startsWith('.')) return;
      if (path.resolve(path.dirname(importer.split('?')[0]),source) === productionClient) return syntheticClient;
    },
  },react()],
  build:{outDir:'dist/cloud-test',emptyOutDir:true,rollupOptions:{input:path.join(root,'cloud.html')}},
  server:{host:'127.0.0.1',proxy:{'/api/cloud-test':{target:'http://127.0.0.1:62850'}}},
});
