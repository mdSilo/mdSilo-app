/**
 * Build the web version of mdSilo, sharing the frontend code in `/src` with the
 * Tauri app. Tauri APIs are replaced with the stand-ins in `src/host/web`,
 * which keep files in IndexedDB instead of the disk.
 *
 *   pnpm start:web   # dev server
 *   pnpm build:web   # output to dist-web
 *
 * Env:
 *   MDSILO_WEB_BASE        serve from a sub path, e.g. `/mdsilo/`
 *   MDSILO_WEB_CORS_PROXY  default CORS proxy to fetch RSS, e.g. `https://proxy.example.com/?url={url}`
 */
import { defineConfig, mergeConfig, Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import baseConfig from './vite.config.mts';
import pkg from './package.json' with { type: 'json' };
import { createCorsProxyHandler } from './web/cors-proxy.mjs';
import { injectPrecache, precacheOf } from './web/pwa-precache.mjs';

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

/**
 * The installable web app (PWA): the manifest, icons and iOS meta tags in
 * index.html, for the web build only (the Tauri app shares index.html).
 * `viewport-fit=cover` lays the page under the notch, see #app-container.
 */
const pwaHead = (): Plugin => {
  let base = '/';
  return {
    name: 'mdsilo-pwa-head',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
          .replace(
            '</head>',
            [
              `<link rel="manifest" href="${base}manifest.webmanifest" />`,
              `<link rel="apple-touch-icon" href="${base}icons/apple-touch-icon.png" />`,
              '<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)" />',
              '<meta name="theme-color" content="#262626" media="(prefers-color-scheme: dark)" />',
              '<meta name="mobile-web-app-capable" content="yes" />',
              '<meta name="apple-mobile-web-app-capable" content="yes" />',
              '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
              '<meta name="apple-mobile-web-app-title" content="mdSilo" />',
              '</head>',
            ].join('\n    '),
          );
      },
    },
  };
};

/**
 * Write the files of the build into the service worker (web/public/fs-sw.js),
 * to keep the app for offline use, see web/pwa-precache.mjs.
 */
const pwaPrecache = (): Plugin => {
  let outDir = '';
  let base = '/';
  return {
    name: 'mdsilo-pwa-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      base = config.base;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(file);
          else files.push(path.relative(outDir, file).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const build = precacheOf(files, (f) => fs.readFileSync(path.join(outDir, f)), base);
      const sw = path.join(outDir, 'fs-sw.js');
      fs.writeFileSync(sw, injectPrecache(fs.readFileSync(sw, 'utf8'), build));
    },
  };
};

const web = (name: string) => path.resolve(import.meta.dirname, './src/host/web', name);

export default mergeConfig(
  baseConfig,
  defineConfig({
    // serve from a sub path with e.g. `--base /mdsilo/`
    base: process.env.MDSILO_WEB_BASE || '/',
    publicDir: 'web/public',
    plugins: [corsProxy(), pwaHead(), pwaPrecache()],
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
