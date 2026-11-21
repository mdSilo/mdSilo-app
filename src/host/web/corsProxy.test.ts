import http from "node:http";
import { AddressInfo } from "node:net";
import { vi } from "vitest";
import {
  createCorsProxyHandler,
  isPrivateIp,
} from "../../../web/cors-proxy.mjs";

describe("cors proxy", () => {
  it("detects private addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  let server: http.Server;
  let base = "";
  beforeAll(async () => {
    server = http.createServer(createCorsProxyHandler());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const get = (query: string) =>
    new Promise<{ status: number; body: string; cors: string }>(
      (resolve, reject) => {
        http
          .get(`${base}/${query}`, (res) => {
            let body = "";
            res.on("data", (c) => {
              body += c;
            });
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                body,
                cors: String(res.headers["access-control-allow-origin"]),
              }),
            );
          })
          .on("error", reject);
      },
    );

  it("rejects bad requests", async () => {
    expect(await get("")).toMatchObject({ status: 400, cors: "*" });
    expect((await get("?url=ftp%3A%2F%2Fa.com")).status).toBe(400);
    expect((await get(`?url=${encodeURIComponent(base)}`)).status).toBe(403);
    expect((await get("?url=http%3A%2F%2F169.254.169.254%2F")).status).toBe(
      403,
    );
  });

  it("proxies public urls", async () => {
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async () =>
        new Response("<rss/>", {
          headers: { "content-type": "application/xml" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const res = await get(
        `?url=${encodeURIComponent("http://93.184.216.34/feed")}`,
      );
      expect(res).toMatchObject({ status: 200, body: "<rss/>", cors: "*" });
      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
        "http://93.184.216.34/feed",
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("cors proxy worker", () => {
  it("handles requests like the node proxy", async () => {
    const { default: worker } =
      await import("../../../web/cors-proxy-worker.mjs");
    const env = { ALLOW_ORIGIN: "https://mdsilo.github.io" };

    const pre = await worker.fetch(
      new Request("https://w.dev/", { method: "OPTIONS" }),
      env,
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(
      "https://mdsilo.github.io",
    );
    expect(pre.headers.get("x-mdsilo-cors-proxy")).toBe("1");

    expect(
      (await worker.fetch(new Request("https://w.dev/"), env)).status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          new Request("https://w.dev/?url=http%3A%2F%2Flocalhost%2F"),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request("https://w.dev/?url=http%3A%2F%2F10.0.0.1%2F"),
          env,
        )
      ).status,
    ).toBe(403);

    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<rss/>", {
          headers: { "content-type": "application/xml" },
        }),
    ) as unknown as typeof fetch;
    try {
      const resp = await worker.fetch(
        new Request("https://w.dev/?url=https%3A%2F%2Fa.com%2Ffeed"),
        env,
      );
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe("<rss/>");
      expect(resp.headers.get("content-type")).toBe("application/xml");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("cors proxy: the relay of the AI", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("relays to the hosts allowed, the headers allowed only, streamed back", async () => {
    const { default: worker } =
      await import("../../../web/cors-proxy-worker.mjs");
    const seen: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response("data: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
    const target = encodeURIComponent(
      "https://api.openai.com/v1/chat/completions",
    );
    const resp = await worker.fetch(
      new Request(`https://w.dev/?url=${target}`, {
        method: "POST",
        headers: {
          authorization: "Bearer k",
          "content-type": "application/json",
          cookie: "secret=1",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: '{"model":"m"}',
      }),
      {},
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("text/event-stream");
    expect(resp.headers.get("access-control-allow-origin")).toBe("*");
    expect(await resp.text()).toBe("data: {}\n\n");
    expect(seen[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.headers).toEqual({
      authorization: "Bearer k",
      "content-type": "application/json",
    });

    // GET, by the header of the method
    await worker.fetch(
      new Request(
        `https://w.dev/?url=${encodeURIComponent("https://api.openai.com/v1/models")}`,
        {
          method: "POST",
          headers: { "x-mdsilo-method": "GET", authorization: "Bearer k" },
        },
      ),
      {},
    );
    expect(seen[1].init).toMatchObject({ method: "GET", body: undefined });
  });

  it("not to other hosts, unless added; preflight allows the headers", async () => {
    const { default: worker } =
      await import("../../../web/cors-proxy-worker.mjs");
    globalThis.fetch = vi.fn(
      async () => new Response("{}"),
    ) as unknown as typeof fetch;
    const post = (url: string, env = {}) =>
      worker.fetch(
        new Request(`https://w.dev/?url=${encodeURIComponent(url)}`, {
          method: "POST",
          body: "{}",
        }),
        env,
      );
    expect((await post("https://evil.example/steal")).status).toBe(403);
    expect((await post("http://10.0.0.1/v1")).status).toBe(403);
    expect(
      (await post("https://llm.my.host/v1/chat", { RELAY_HOSTS: "my.host" }))
        .status,
    ).toBe(200);
    const pre = await worker.fetch(
      new Request("https://w.dev/", { method: "OPTIONS" }),
      {},
    );
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");
    expect(pre.headers.get("access-control-allow-headers")).toContain(
      "x-api-key",
    );
  });

  it("the node proxy relays too", async () => {
    globalThis.fetch = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Response(`got ${String(init?.body)}`),
    ) as unknown as typeof fetch;
    const target = encodeURIComponent("https://api.anthropic.com/v1/messages");
    // a public address for the host, as DNS would give
    const server = http.createServer(
      createCorsProxyHandler({ resolve: async () => ["93.184.216.34"] }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          `${base}/?url=${target}`,
          { method: "POST", headers: { "x-api-key": "k" } },
          (r) => {
            let body = "";
            r.on("data", (c) => (body += c));
            r.on("end", () => resolve({ status: r.statusCode ?? 0, body }));
          },
        );
        req.on("error", reject);
        req.end("hello");
      },
    );
    await new Promise<void>((r) => server.close(() => r()));
    expect(res).toEqual({ status: 200, body: "got hello" });
  });
});
