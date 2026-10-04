import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Yarn workspaces are symlinked outside node_modules. mdsmirror is emitted as
  // CommonJS, so Rollup's default CommonJS include rule would otherwise skip it
  // during production builds.
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages[\\/]mdsmirror/],
    },
  },
  // Linked workspace packages are served as raw source in dev, not pre-bundled.
  // mdsmirror's CommonJS dist then breaks named ESM imports at runtime, so
  // force esbuild to pre-bundle it.
  optimizeDeps: {
    include: ['mdsmirror'],
  },
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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/setupTests.ts', 'src/testUtils.tsx', 'src/index.tsx'],
    },
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
      // prosemirror-history's CommonJS build does `require('rope-sequence')`,
      // which resolves to the ES module (no default interop) and breaks the
      // undo history on typing. Point it to the CommonJS entry instead.
      'rope-sequence': path.resolve(__dirname, './node_modules/rope-sequence/dist/index.js'),
    },
  },
});
