// vite.config.ts
// ═══════════════════════════════════════════════════════════════
// Vite configuration — CLEANED v2.0 (2026-02-21)
// ★ Removed duplicate GEMINI_API_KEY env variable
// ═══════════════════════════════════════════════════════════════

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: 'localhost',
    },
    plugins: [react()],
    define: {
      // ★ Single source of truth — only API_KEY is used in aiProvider.ts
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
