import { forgetRelayed, sendFromBrowser } from "./transport";

let proxy = "";
vi.mock("@/host/web/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/host/web/feed")>()),
  getCorsProxy: async () => proxy,
}));

const provider = { id: "p", label: "Provider" };
const init = {
  method: "POST" as const,
  headers: {
    authorization: "Bearer k",
    "content-type": "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
  },
  body: "{}",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  forgetRelayed();
});

test("directly when the browser can", async () => {
  const fetchMock = vi.fn(async () => new Response("ok"));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const r = await sendFromBrowser(provider, "https://api.x.com/v1/a", init);
  expect(await r.text()).toBe("ok");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]).toEqual(["https://api.x.com/v1/a", init]);
});

test("blocked: by the relay of the CORS proxy set up, then from the start", async () => {
  proxy = "https://my-proxy.workers.dev/?url={url}";
  const calls: [string, RequestInit][] = [];
  globalThis.fetch = vi.fn(async (url: string, opts: RequestInit) => {
    calls.push([url, opts]);
    if (url.startsWith("https://api.x.com"))
      throw new TypeError("Failed to fetch");
    return new Response("relayed");
  }) as unknown as typeof fetch;
  const r = await sendFromBrowser(provider, "https://api.x.com/v1/a", init);
  expect(await r.text()).toBe("relayed");
  expect(calls[1][0]).toBe(
    `https://my-proxy.workers.dev/?url=${encodeURIComponent("https://api.x.com/v1/a")}`,
  );
  // the headers the relay takes only, the method told
  expect(calls[1][1]).toMatchObject({
    method: "POST",
    body: "{}",
    headers: {
      "x-mdsilo-method": "POST",
      authorization: "Bearer k",
      "content-type": "application/json",
    },
  });
  expect(calls[1][1].headers).not.toHaveProperty(
    "anthropic-dangerous-direct-browser-access",
  );
  // the next one: the relay at once
  await sendFromBrowser(provider, "https://api.x.com/v1/models", {
    method: "GET",
    headers: {},
  });
  expect(calls).toHaveLength(3);
  expect(calls[2][1]).toMatchObject({
    method: "POST",
    body: undefined,
    headers: { "x-mdsilo-method": "GET" },
  });
});

test("never by the public proxy, nor without one: said what to do", async () => {
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  const { PUBLIC_CORS_PROXY } = await import("@/host/web/feed");
  for (proxy of [PUBLIC_CORS_PROXY, ""]) {
    await expect(
      sendFromBrowser(provider, "https://api.x.com/v1/a", init),
    ).rejects.toThrow(/set your own CORS proxy/);
  }
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

test("an error of the provider: its status and text", async () => {
  globalThis.fetch = vi.fn(
    async () => new Response("bad key", { status: 401 }),
  ) as unknown as typeof fetch;
  await expect(
    sendFromBrowser(provider, "https://api.x.com/v1/a", init),
  ).rejects.toThrow("401: bad key");
});
