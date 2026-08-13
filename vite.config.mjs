import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  base: './',
  publicDir: 'renderer/public',
  define: { Module: 'globalThis.Module' },
  plugins: [vue()],
  build: { outDir: 'renderer-dist', emptyOutDir: true },
});
