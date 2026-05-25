import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'http';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    proxy: {
      // SSE stream — must use a persistent connection; no keepAlive override
      '/api/harmonise/stream': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        timeout: 0,             // no timeout — stream runs until all 24 domains complete
        proxyTimeout: 0
      },
      // All other API calls — keepAlive disabled so stale connections from a
      // server restart don't cause ECONNRESET on the first request after reboot
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
        agent: new http.Agent({ keepAlive: false })
      }
    }
  }
});
