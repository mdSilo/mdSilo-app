/**
 * Build the web version of mdSilo, sharing the frontend code in `/src` with the
 * Tauri app. Tauri APIs are replaced with the stand-ins in `src/platform/web`,
 * which keep files in IndexedDB instead of the disk.
 *
 *   yarn start:web   # dev server
 *   yarn build:web   # output to dist-web
 */
import { defineConfig, mergeConfig } from 'vite';
import path from 'path';
import baseConfig from './vite.config';
import pkg from './package.json';

const web = (name: string) => path.resolve(__dirname, './src/platform/web', name);

export default mergeConfig(
  baseConfig,
  defineConfig({
    // serve from a sub path with e.g. `--base /mdsilo/`
    base: process.env.MDSILO_WEB_BASE || '/',
    publicDir: 'web/public',
    define: {
      __MDSILO_WEB__: 'true',
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: [
        { find: /^@tauri-apps\/api\/core$/, replacement: web('core.ts') },
        { find: /^@tauri-apps\/api\/event$/, replacement: web('event.ts') },
        { find: /^@tauri-apps\/api\/window$/, replacement: web('window.ts') },
        { find: /^@tauri-apps\/api\/app$/, replacement: web('app.ts') },
        { find: /^@tauri-apps\/plugin-dialog$/, replacement: web('dialog.ts') },
      ],
    },
    server: {
      port: 3001,
    },
    build: {
      outDir: 'dist-web',
    },
  }),
);
