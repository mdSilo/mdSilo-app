import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      components: path.resolve(__dirname, './src/components'),
      context: path.resolve(__dirname, './src/context'),
      editor: path.resolve(__dirname, './src/editor'),
      file: path.resolve(__dirname, './src/file'),
      lib: path.resolve(__dirname, './src/lib'),
      utils: path.resolve(__dirname, './src/utils'),
      types: path.resolve(__dirname, './src/types'),
      asset: path.resolve(__dirname, './src/asset'),
      styles: path.resolve(__dirname, './src/styles'),
    },
  },
});
