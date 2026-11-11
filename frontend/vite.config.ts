import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Backend chạy ở cổng 4000 — mọi request /api được proxy sang
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } },
  },
});
