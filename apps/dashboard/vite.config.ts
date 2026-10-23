import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: Vite serves the SPA on 5173 and forwards the API to the Fastify server (PORT, 3300 in
// .env). Production: `vite build` writes dist/web, which Fastify serves (WEB_DIST).
const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 3300}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget },
      '/healthz': { target: apiTarget },
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: true,
    // three.js and maplibre are large on their own; they are split into lazy chunks.
    chunkSizeWarningLimit: 1500,
  },
});
