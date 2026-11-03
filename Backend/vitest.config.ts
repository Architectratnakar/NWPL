import { defineConfig } from 'vitest/config';

// Keeps the Backend tests independent of any vite.config.ts in parent folders
export default defineConfig({
  test: { root: __dirname, include: ['src/**/*.test.ts'], environment: 'node' },
});
