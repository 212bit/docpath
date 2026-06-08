import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/dashboard-ui',
    emptyOutDir: false,
    lib: {
      entry: 'src/dashboard-ui/main.tsx',
      name: 'DocPathDashboard',
      formats: ['iife'],
      fileName: () => 'dashboard-ui.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'dashboard-ui.[ext]',
      },
    },
  },
});
