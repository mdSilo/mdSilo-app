/**
 * Build the web version of mdSilo, sharing the frontend code in `/src` with the
 * Tauri app. Tauri APIs are replaced with the stand-ins in `src/platform/web`,
 * which keep files in IndexedDB instead of the disk.
 *
 *   yarn start:web   # dev server
 *   yarn build:web   # output to dist-web
 *
 * Env:
 *   MDSILO_WEB_BASE        serve from a sub path, e.g. `/mdsilo/`
 *   MDSILO_WEB_CORS_PROXY  default CORS proxy to fetch RSS, e.g. `https://proxy.example.com/?url={url}`
 */
import { defineConfig, mergeConfig, Plugin } from 'vite';
import path from 'path';
import baseConfig from './vite.config';
import pkg from './package.json';
import { createCorsProxyHandler } from './web/cors-proxy.mjs';

/** CORS proxy for fetching feeds, mounted at `/__cors_proxy__?url=` on dev/preview server */
const corsProxy = (): Plugin => {
  const handler = createCorsProxyHandler();
  return {
    name: 'mdsilo-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/__cors_proxy__', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__cors_proxy__', handler);
    },
  };
};

const web = (name: string) => path.resolve(__dirname, './src/platform/web', name);

export default mergeConfig(
  baseConfig,
  defineConfig({
    // serve from a sub path with e.g. `--base /mdsilo/`
    base: process.env.MDSILO_WEB_BASE || '/',
    publicDir: 'web/public',
    plugins: [corsProxy()],
    define: {
      __MDSILO_WEB__: 'true',
      __APP_VERSION__: JSON.stringify(pkg.version),
      // default CORS proxy to fetch feeds, e.g. `https://proxy.example.com/?url={url}`,
      // can be changed in Settings. Defaults to the proxy of dev/preview server.
      __MDSILO_CORS_PROXY__: JSON.stringify(process.env.MDSILO_WEB_CORS_PROXY ?? ''),
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
