import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';

/**
 * CommonJS entry of rope-sequence, as required by prosemirror-history.
 * pnpm keeps it out of the root node_modules (not a direct dependency):
 * resolve it from where mdsmirror finds prosemirror-history.
 */
function ropeSequenceCjs(): string {
  const fromMdsmirror = createRequire(path.resolve(import.meta.dirname, 'packages/mdsmirror/package.json'));
  const history = fromMdsmirror.resolve('prosemirror-history');
  return createRequire(history).resolve('rope-sequence');
}

/** pdfjs-dist, as foliate-js depends on it */
const pdfjsDir = path.dirname(
  createRequire(path.resolve(import.meta.dirname, 'packages/foliate-js/package.json'))
    .resolve('pdfjs-dist/package.json'),
);

/**
 * The files pdf.js loads at run time, by their path under `vendor/pdfjs/`
 * (see packages/foliate-js/pdf.js): the worker, cmaps, fonts, wasm decoders
 * and the CSS of its text and annotation layers.
 */
function pdfjsFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const add = (dir: string, prefix: string, filter: (name: string) => boolean = () => true) => {
    for (const name of fs.readdirSync(dir)) {
      if (filter(name)) files.set(`${prefix}${name}`, path.join(dir, name));
    }
  };
  files.set('pdf.worker.min.mjs', path.join(pdfjsDir, 'legacy/build/pdf.worker.min.mjs'));
  add(path.join(pdfjsDir, 'cmaps'), 'cmaps/');
  add(path.join(pdfjsDir, 'standard_fonts'), 'standard_fonts/');
  add(path.join(pdfjsDir, 'wasm'), '', (name) => /\.(wasm|js)$/.test(name));
  add(path.resolve(import.meta.dirname, 'packages/foliate-js/vendor/pdfjs'), '', (name) => name.endsWith('.css'));
  return files;
}

const MIME: Record<string, string> = {
  '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
};

/** Serve the pdf.js files in dev, emit them in builds. */
function pdfjsVendor(): Plugin {
  // the app sets where pdf.js loads them from: src/reader/document.ts
  const prefix = 'vendor/pdfjs/';
  return {
    name: 'mdsilo-pdfjs-vendor',
    configureServer(server) {
      const files = pdfjsFiles();
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        const at = url.indexOf(`/${prefix}`);
        const file = at >= 0 ? files.get(url.slice(at + prefix.length + 1)) : undefined;
        if (!file) return next();
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, file] of pdfjsFiles()) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${name}`, source: fs.readFileSync(file) });
      }
    },
  };
}

/**
 * Fingerprint of the mdsmirror build (packages/mdsmirror/dist).
 * Vite keys its pre-bundled deps cache on the lockfile and this config only,
 * so a rebuilt mdsmirror would keep being served from the stale cache.
 */
function mdsmirrorBuildId(): string {
  const dist = path.resolve(import.meta.dirname, 'packages/mdsmirror/dist');
  const hash = crypto.createHash('sha1');
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // not built yet
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (entry.name.endsWith('.js')) {
        const { size, mtimeMs } = fs.statSync(file);
        hash.update(`${file}:${size}:${mtimeMs}\n`);
      }
    }
  };
  walk(dist);
  return hash.digest('hex');
}

export default defineConfig({
  // no CSS needed in tests (jsdom): skip compiling Tailwind CSS and daisyUI
  plugins: [react(), ...(process.env.VITEST ? [] : [tailwindcss(), pdfjsVendor()])],
  // Linked workspace packages are served as raw source in dev, not pre-bundled:
  // pre-bundle mdsmirror with its dependencies (hundreds of modules otherwise).
  optimizeDeps: {
    include: ['mdsmirror'],
    // part of the cache key: re-bundle mdsmirror whenever it is rebuilt
    rolldownOptions: {
      transform: {
        define: { __MDSMIRROR_BUILD__: JSON.stringify(mdsmirrorBuildId()) },
      },
    },
  },
  // keep the errors from the Rust side visible in `tauri dev`
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    watch: {
      // `tauri dev` writes there (target/, gen/schemas): watching it is
      // costly and must never reload the page, Tauri restarts the app itself
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // vitest 4+ only excludes node_modules and .git by default; mdsmirror's
    // dist has the compiled tests too
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', 'dist-web/**', 'src-tauri/**'],
    env: {
      // styled-components outside production appends each rule as text, and
      // jsdom 27+ re-parses the whole <style> on every append: the editor
      // styles took ~7s per first render. insertRule does not re-parse.
      SC_DISABLE_SPEEDY: 'false',
    },
    // react-virtualized 10's ESM imports 'dom-helpers/scrollbarSize', a
    // directory import that Node's ESM loader refuses; let vite resolve it
    server: {
      deps: { inline: ['react-virtualized'] },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/setupTests.ts', 'src/testUtils.tsx',
        'src/reader/testBook.ts', 'src/index.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // imported by packages/foliate-js/pdf.js, loaded on first use
      '@pdfjs/pdf.min.mjs': path.join(pdfjsDir, 'legacy/build/pdf.min.mjs'),
      // prosemirror-history's CommonJS build does `require('rope-sequence')`,
      // which resolves to the ES module (no default interop) and breaks the
      // undo history on typing. Point it to the CommonJS entry instead.
      'rope-sequence': ropeSequenceCjs(),
    },
  },
});
