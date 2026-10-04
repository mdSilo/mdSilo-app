/**
 * A minimal CORS proxy for the web version of mdSilo, so feeds without CORS
 * headers can be fetched from browser. No dependencies, Node >= 18.
 *
 *   node web/cors-proxy.mjs                 # listen on 0.0.0.0:8787
 *   PORT=9000 ALLOW_ORIGIN=https://my.site node web/cors-proxy.mjs
 *
 * Then set the proxy in mdSilo Settings to `http://host:8787/?url={url}`.
 * It is also mounted on the vite dev / preview servers at `/__cors_proxy__`.
 *
 * Only GET http(s) requests to public addresses are proxied.
 */
import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15000;

/** true for loopback, private, link-local, ... addresses */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd')
    || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')
    || v6.startsWith('ff');
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Invalid url'), { status: 400 });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('Only http(s) url is allowed'), { status: 400 });
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw Object.assign(new Error('Address is not allowed'), { status: 403 });
  }
  return url;
}

/** fetch with redirects followed manually, so every hop is checked */
async function proxyFetch(raw, signal) {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const resp = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'mdSilo-cors-proxy',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    const location = resp.headers.get('location');
    if (resp.status >= 300 && resp.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).href);
      continue;
    }
    return resp;
  }
  throw Object.assign(new Error('Too many redirects'), { status: 502 });
}

/**
 * Connect/Express style middleware: `GET <mount>?url=<encoded url>`
 * @param {{ allowOrigin?: string }} options
 */
export function createCorsProxyHandler(options = {}) {
  const allowOrigin = options.allowOrigin || '*';
  return async function corsProxy(req, res) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }
    const target = new URL(req.url || '/', 'http://localhost').searchParams.get('url');
    if (!target) {
      res.statusCode = 400;
      res.end('Missing url');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await proxyFetch(target, controller.signal);
      const body = Buffer.from(await resp.arrayBuffer());
      if (body.length > MAX_BYTES) {
        res.statusCode = 413;
        res.end('Response too large');
        return;
      }
      res.statusCode = resp.status;
      res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/octet-stream');
      res.end(body);
    } catch (e) {
      res.statusCode = e.status || 502;
      res.end(e.status ? e.message : 'Bad Gateway');
    } finally {
      clearTimeout(timer);
    }
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
