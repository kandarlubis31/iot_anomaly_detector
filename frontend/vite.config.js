// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://iotanomalydetector-production.up.railway.app', 
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'), // Pastikan path tetap /api
      },
    },
  },
});