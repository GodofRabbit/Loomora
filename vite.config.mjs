import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  base: './',
  publicDir: 'renderer/public',
  define: { Module: 'globalThis.Module' },
  plugins: [vue()],
  build: {
    outDir: 'renderer-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(rootDirectory, 'index.html'),
        ocrWorker: resolve(rootDirectory, 'ocr-worker.html'),
      },
    },
  },
});
