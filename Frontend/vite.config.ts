import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import type { ServerResponse } from 'node:http';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 127.0.0.1 (not "localhost") avoids the IPv6/IPv4 mix-up some Windows PCs have
  const backend = env.BACKEND_URL || 'http://127.0.0.1:4000';
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      // In development the Frontend forwards /api calls to the Backend, so login cookies work on one origin.
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          configure: (proxy) => {
            // Backend not running → answer with a clear message instead of an empty 500
            proxy.on('error', (err, _req, res) => {
              console.error(`\n❌ Cannot reach the Backend at ${backend} (${(err as NodeJS.ErrnoException).code ?? err.message}).\n   Start it in another terminal:  cd Backend  →  npm run dev\n`);
              const r = res as ServerResponse;
              if (typeof r.writeHead === 'function' && !r.headersSent) {
                r.writeHead(502, { 'Content-Type': 'application/json' });
                r.end(JSON.stringify({ error: { code: 'BACKEND_NOT_RUNNING', message: `The Backend is not running at ${backend}. Open a terminal in the Backend folder and run: npm run dev` } }));
              }
            });
          },
        },
      },
    },
  };
});
