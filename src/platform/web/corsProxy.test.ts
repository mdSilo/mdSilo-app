import http from 'node:http';
import { AddressInfo } from 'node:net';
import { vi } from 'vitest';
import { createCorsProxyHandler, isPrivateIp } from '../../../web/cors-proxy.mjs';

describe('cors proxy', () => {
  it('detects private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  let server: http.Server;
  let base = '';
  beforeAll(async () => {
    server = http.createServer(createCorsProxyHandler());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const get = (query: string) => new Promise<{ status: number; body: string; cors: string }>((resolve, reject) => {
    http.get(`${base}/${query}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body,
        cors: String(res.headers['access-control-allow-origin']),
      }));
    }).on('error', reject);
  });

  it('rejects bad requests', async () => {
    expect(await get('')).toMatchObject({ status: 400, cors: '*' });
    expect((await get('?url=ftp%3A%2F%2Fa.com')).status).toBe(400);
    expect((await get(`?url=${encodeURIComponent(base)}`)).status).toBe(403);
    expect((await get('?url=http%3A%2F%2F169.254.169.254%2F')).status).toBe(403);
  });

  it('proxies public urls', async () => {
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response('<rss/>', { headers: { 'content-type': 'application/xml' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const res = await get(`?url=${encodeURIComponent('http://93.184.216.34/feed')}`);
      expect(res).toMatchObject({ status: 200, body: '<rss/>', cors: '*' });
      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('http://93.184.216.34/feed');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('cors proxy worker', () => {
  it('handles requests like the node proxy', async () => {
    const { default: worker } = await import('../../../web/cors-proxy-worker.mjs');
    const env = { ALLOW_ORIGIN: 'https://mdsilo.github.io' };

    const pre = await worker.fetch(new Request('https://w.dev/', { method: 'OPTIONS' }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://mdsilo.github.io');
    expect(pre.headers.get('x-mdsilo-cors-proxy')).toBe('1');

    expect((await worker.fetch(new Request('https://w.dev/'), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://w.dev/?url=http%3A%2F%2Flocalhost%2F'), env)).status).toBe(403);
    expect((await worker.fetch(new Request('https://w.dev/?url=http%3A%2F%2F10.0.0.1%2F'), env)).status).toBe(403);

    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('<rss/>', { headers: { 'content-type': 'application/xml' } })) as unknown as typeof fetch;
    try {
      const resp = await worker.fetch(new Request('https://w.dev/?url=https%3A%2F%2Fa.com%2Ffeed'), env);
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe('<rss/>');
      expect(resp.headers.get('content-type')).toBe('application/xml');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
