import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        configure: (proxy) => {
          // When the backend is briefly unavailable (ECONNRESET / ECONNREFUSED
          // during node --watch restart), return 503 JSON so the client-side
          // fetchWithRetry can detect and retry rather than showing a generic error.
          proxy.on('error', (_err, _req, res) => {
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Service temporarily unavailable.', retryable: true }));
            }
          });
        }
      }
    }
  }
});
