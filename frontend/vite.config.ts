import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples');

export default defineConfig({
  plugins: [react()],
  // The demo test data is the repository's own samples/test-data.csv, imported as text (import x from '@samples/test-data.csv?raw').
  resolve: { alias: { '@samples': samples } },
  server: {
    fs: { allow: ['.', samples] },
    port: 5173,
    // Local development talks to the Spring Boot service on :8080
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
