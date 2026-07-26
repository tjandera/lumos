import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // apps/api (Fastify) runs separately on 8787 — proxying keeps browser requests
    // same-origin in dev so the API doesn't need a CORS setup at all.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
});
