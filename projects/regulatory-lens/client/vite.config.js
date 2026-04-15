import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    proxy: {
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        timeout: 120000,        // 2 min — covers PDF ingestion + Claude extraction
        proxyTimeout: 120000
      }
    }
  }
});
