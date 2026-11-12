import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Chunk three.js (cảnh 3D trang đăng nhập, ~140 KB gzip) chỉ tải lười ở trang đó → nới ngưỡng cảnh báo mặc định 500 KB
  build: { chunkSizeWarningLimit: 600 },
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
