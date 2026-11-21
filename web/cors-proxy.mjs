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
 * Only GET http(s) requests to public addresses are proxied; POST requests
 * of the AI of the web version are relayed to the AI hosts it knows (and
 * those of RELAY_HOSTS=host1,host2), see handleRelay in cors-proxy-core.mjs.
 */
import http from 'node:http';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { handleProxy, handleRelay, isPrivateIp, MAX_RELAY_BYTES, relayHostsOf } from './cors-proxy-core.mjs';

export { isPrivateIp };

const resolve = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

/**
 * Connect/Express style middleware: `GET <mount>?url=<encoded url>`
 * @param {{ allowOrigin?: string, relayHosts?: string, resolve?: (host: string) => Promise<string[]> }} options
 */
export function createCorsProxyHandler(options = {}) {
  // the addresses of a host, checked not private; given for tests
  const lookup = options.resolve ?? resolve;
  return async function corsProxy(req, res) {
    let result;
    if (req.method === 'POST') {
      // the AI of the web version: the body read (a file at most), relayed
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_RELAY_BYTES) {
          res.statusCode = 413;
          res.end('Request too large');
          return;
        }
        chunks.push(chunk);
      }
      result = await handleRelay(
        { url: req.url || '/', headers: req.headers, body: Buffer.concat(chunks) },
        { allowOrigin: options.allowOrigin, resolve: lookup, relayHosts: relayHostsOf(options.relayHosts) },
      );
    } else {
      result = await handleProxy(
        { method: req.method || 'GET', url: req.url || '/' },
        { allowOrigin: options.allowOrigin, resolve: lookup },
      );
    }
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    if (result.body && typeof result.body === 'object' && 'getReader' in result.body) {
      // streamed as it comes
      Readable.fromWeb(result.body).pipe(res);
      return;
    }
    res.end(result.body === null ? undefined : typeof result.body === 'string' ? result.body : Buffer.from(result.body));
  };
}

// run as a standalone server
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  const handler = createCorsProxyHandler({
    allowOrigin: process.env.ALLOW_ORIGIN,
    relayHosts: process.env.RELAY_HOSTS,
  });
  http.createServer(handler).listen(port, host, () => {
    console.log(`mdSilo CORS proxy on http://${host}:${port}/?url={url}`);
  });
}
