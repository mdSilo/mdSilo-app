/**
 * Platform-neutral core of the mdSilo CORS proxy, shared by
 * web/cors-proxy.mjs (Node, vite dev/preview server) and
 * web/cors-proxy-worker.mjs (Cloudflare Workers, for static hosting).
 * Only standard web APIs (fetch, URL, Response) are used here.
 *
 * API: GET <proxy>?url=<encoded url>
 */

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
export const TIMEOUT_MS = 15000;
/** response header to tell the proxy from a static file server, see src/platform/web/feed.ts */
export const PROXY_HEADER = 'X-Mdsilo-Cors-Proxy';

export class ProxyError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIPv4(ip) {
  const m = IPV4.exec(ip);
  return Boolean(m) && m.slice(1).every((n) => Number(n) <= 255);
}

/** true for loopback, private, link-local, ... addresses */
export function isPrivateIp(ip) {
  if (isIPv4(ip)) {
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

/** parse and check scheme, hostname literal; `resolve` checks resolved addresses if given */
export async function assertPublicUrl(raw, resolve) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ProxyError('Invalid url', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError('Only http(s) url is allowed', 400);
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isIpLiteral = isIPv4(host) || host.includes(':');
  if (host === 'localhost' || host.endsWith('.localhost') || (isIpLiteral && isPrivateIp(host))) {
    throw new ProxyError('Address is not allowed', 403);
  }
  if (resolve && !isIpLiteral) {
    const addrs = await resolve(host);
    if (addrs.length === 0 || addrs.some(isPrivateIp)) {
      throw new ProxyError('Address is not allowed', 403);
    }
  }
  return url;
}

export function corsHeaders(allowOrigin = '*') {
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': PROXY_HEADER,
    Vary: 'Origin',
    [PROXY_HEADER]: '1',
  };
}

/** fetch with redirects followed manually, so every hop is checked */
async function proxyFetch(raw, resolve, signal) {
  let url = await assertPublicUrl(raw, resolve);
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
      url = await assertPublicUrl(new URL(location, url).href, resolve);
      continue;
    }
    return resp;
  }
  throw new ProxyError('Too many redirects', 502);
}

/**
 * Handle a proxy request
 * @param {{ method: string, url: string }} req - method and full request url
 * @param {{ allowOrigin?: string, resolve?: (host: string) => Promise<string[]> }} options
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: ArrayBuffer | string | null }>}
 */
export async function handleProxy(req, options = {}) {
  const headers = corsHeaders(options.allowOrigin);
  if (req.method === 'OPTIONS') {
    return { status: 204, headers, body: null };
  }
  if (req.method !== 'GET') {
    return { status: 405, headers, body: 'Method Not Allowed' };
  }
  const target = new URL(req.url, 'http://localhost').searchParams.get('url');
  if (!target) {
    return { status: 400, headers, body: 'Missing url' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await proxyFetch(target, options.resolve, controller.signal);
    const body = await resp.arrayBuffer();
    if (body.byteLength > MAX_BYTES) {
      return { status: 413, headers, body: 'Response too large' };
    }
    return {
      status: resp.status,
      headers: { ...headers, 'Content-Type': resp.headers.get('content-type') || 'application/octet-stream' },
      body,
    };
  } catch (e) {
    return e instanceof ProxyError
      ? { status: e.status, headers, body: e.message }
      : { status: 502, headers, body: 'Bad Gateway' };
  } finally {
    clearTimeout(timer);
  }
}
