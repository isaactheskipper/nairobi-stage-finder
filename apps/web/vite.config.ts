import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stage/shared': path.resolve(
        import.meta.dirname,
        '../../packages/shared/src'
      ),
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
  },
  server: {
    port: 5173,
    host: true,
  },
});

