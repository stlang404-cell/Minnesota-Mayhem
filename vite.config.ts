import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 120000 },
} as any);
