import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // localhost only, same as the API
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
