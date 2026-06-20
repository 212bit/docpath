import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: 'src/dashboard-ui',
  build: {
    outDir: '../../dashboard-dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5178,
  },
});
