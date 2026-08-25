/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// Multi-page build: `/`, `/app/`, and `/callback/` are real paths so any
// static host serves them without rewrite rules. The OAuth redirect URI
// (`/callback`) must resolve server-side; views inside /app use hash routing.
export default defineConfig({
  plugins: [preact()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
        callback: resolve(import.meta.dirname, 'callback/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
