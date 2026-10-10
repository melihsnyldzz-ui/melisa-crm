import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const stable = process.env.VITE_CRM_STABLE_TRANSPORT === '1';
if (process.env.VITE_CRM_STABLE_TRANSPORT && !['0', '1'].includes(process.env.VITE_CRM_STABLE_TRANSPORT)) throw Error('CRM_STABLE_BUILD_INVALID');
export default defineConfig({
  base: stable ? '/crm/' : '/',
  build: {
    outDir: stable ? 'dist/stable-client' : 'dist/client',
    emptyOutDir: stable || process.env.VITE_CRM_TEST !== "1",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
