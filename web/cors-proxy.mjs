/**
 * A minimal CORS proxy for the web version of mdSilo, so feeds without CORS
 * headers can be fetched from browser. No dependencies, Node >= 18.
 *
 *   node web/cors-proxy.mjs                 # listen on 0.0.0.0:8787
 *   PORT=9000 ALLOW_ORIGIN=https://my.site node web/cors-proxy.mjs
 *
 * Then set the proxy in mdSilo Settings to `http://host:8787/?url={url}`.
 * It is also mounted on the vite dev / preview servers at `/__cors_proxy__`.
 * For static hosting w/o a server, see web/cors-proxy-worker.mjs.
 *
 * Only GET http(s) requests to public addresses are proxied.
 */
import http from 'node:http';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { handleProxy, isPrivateIp } from './cors-proxy-core.mjs';

export { isPrivateIp };

const resolve = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

/**
 * Connect/Express style middleware: `GET <mount>?url=<encoded url>`
 * @param {{ allowOrigin?: string }} options
 */
export function createCorsProxyHandler(options = {}) {
  return async function corsProxy(req, res) {
    const result = await handleProxy(
      { method: req.method || 'GET', url: req.url || '/' },
      { allowOrigin: options.allowOrigin, resolve },
    );
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    res.end(result.body === null ? undefined : typeof result.body === 'string' ? result.body : Buffer.from(result.body));
  };
}

// run as a standalone server
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  const handler = createCorsProxyHandler({ allowOrigin: process.env.ALLOW_ORIGIN });
  http.createServer(handler).listen(port, host, () => {
    console.log(`mdSilo CORS proxy on http://${host}:${port}/?url={url}`);
  });
}
