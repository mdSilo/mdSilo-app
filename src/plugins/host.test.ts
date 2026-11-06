import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { CALL_TIMEOUT, createHost, type PluginMethods } from "./host";
import { parseManifest } from "./manifest";
import { enablePlugin, type InstalledPlugin } from "./registry";

const plugin: InstalledPlugin = {
  id: "csv",
  dir: "/data/csv",
  where: "device",
  hash: "",
  manifest: parseManifest({
    id: "csv",
    name: "CSV",
    version: "1.2.0",
    permissions: ["file:read", "file:write"],
  }),
};

let frame: HTMLIFrameElement;
let other: HTMLIFrameElement;
let posted: ReturnType<typeof vi.fn>;

/** what the page of the plugin, or another page, sends */
const send = (data: unknown, source: Window | null = frame.contentWindow) =>
  window.dispatchEvent(new MessageEvent("message", { data, source }));

/** the answer to the last call */
const answer = async () => {
  await vi.waitFor(() => expect(posted).toHaveBeenCalled());
  return posted.mock.calls.at(-1)?.[0];
};

const methods: PluginMethods = {
  "file.read": { permission: "file:read", handler: () => "a,b" },
  "file.write": {
    permission: "file:write",
    handler: () => {
      throw new Error("Disk full");
    },
  },
  echo: { handler: (params) => params },
};

beforeEach(() => {
  store.setState({ pluginStates: {} });
  enablePlugin(plugin, ["file:read"]);
  frame = document.createElement("iframe");
  other = document.createElement("iframe");
  document.body.append(frame, other);
  posted = vi.fn();
  frame.contentWindow!.postMessage = posted as Window["postMessage"];
});

afterEach(() => {
  frame.remove();
  other.remove();
});

describe("createHost", () => {
  it("answers a call with what the method gives", async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 7, method: "echo", params: { x: 1 } });
    expect(await answer()).toEqual({ mdsilo: 1, id: 7, result: { x: 1 } });
    expect(posted.mock.calls[0][1]).toBe("*");
    host.dispose();
  });

  it("checks the permission granted", async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: "file.read" });
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, result: "a,b" });
    posted.mockClear();
    send({ mdsilo: 1, id: 2, method: "file.write" });
    expect(await answer()).toEqual({
      mdsilo: 1,
      id: 2,
      error: "Not permitted: file:write",
    });
    host.dispose();
  });

  it("reads the permissions on each call", async () => {
    const host = createHost(plugin, frame, () => methods);
    enablePlugin(plugin, []);
    send({ mdsilo: 1, id: 1, method: "file.read" });
    expect(await answer()).toEqual({
      mdsilo: 1,
      id: 1,
      error: "Not permitted: file:read",
    });
    host.dispose();
  });

  it("gives the errors of the methods, and of unknown methods", async () => {
    enablePlugin(plugin);
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: "file.write" });
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, error: "Disk full" });
    posted.mockClear();
    send({ mdsilo: 1, id: 2, method: "toString" });
    expect(await answer()).toEqual({
      mdsilo: 1,
      id: 2,
      error: "Unknown method: toString",
    });
    host.dispose();
  });

  it("has app.info for every plugin", async () => {
    const host = createHost(plugin, frame);
    send({ mdsilo: 1, id: 1, method: "app.info" });
    expect((await answer()).result).toEqual({
      id: "csv",
      version: "1.2.0",
      permissions: ["file:read"],
    });
    host.dispose();
  });

  it("a plugin can not replace app.info", async () => {
    const host = createHost(plugin, frame, () => ({
      "app.info": { handler: () => "fake" },
    }));
    send({ mdsilo: 1, id: 1, method: "app.info" });
    expect((await answer()).result).not.toBe("fake");
    host.dispose();
  });

  it("ignores other pages and other messages", async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: "echo" }, other.contentWindow);
    send({ mdsilo: 1, id: 1, method: "echo" }, window);
    send({ mdsilo: 2, id: 1, method: "echo" });
    send({ id: 1, method: "echo" });
    send("echo");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).not.toHaveBeenCalled();
    host.dispose();
  });

  it("stops answering when disposed, and tells of changes", async () => {
    const host = createHost(plugin, frame, () => methods);
    host.emit("style", { dark: true });
    expect(posted).toHaveBeenCalledWith(
      { mdsilo: 1, event: "style", data: { dark: true } },
      "*",
    );
    posted.mockClear();
    host.dispose();
    send({ mdsilo: 1, id: 1, method: "echo" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).not.toHaveBeenCalled();
  });
});

describe("asking the plugin", () => {
  it("gets the answer of the plugin", async () => {
    const host = createHost(plugin, frame);
    const answered = host.call("code.render", { code: "a" });
    expect(posted).toHaveBeenCalledWith(
      { mdsilo: 1, request: 1, method: "code.render", params: { code: "a" } },
      "*",
    );
    send({ mdsilo: 1, reply: 1, result: "<svg/>" });
    expect(await answered).toBe("<svg/>");
    host.dispose();
  });

  it("gets the error of the plugin", async () => {
    const host = createHost(plugin, frame);
    const answered = host.call("code.render");
    send({ mdsilo: 1, reply: 1, error: "Bad code" });
    await expect(answered).rejects.toThrow("Bad code");
    host.dispose();
  });

  it("takes no answer from another page", async () => {
    vi.useFakeTimers();
    const host = createHost(plugin, frame);
    const answered = host.call("code.render");
    send({ mdsilo: 1, reply: 1, result: "fake" }, other.contentWindow);
    vi.advanceTimersByTime(CALL_TIMEOUT);
    await expect(answered).rejects.toThrow("CSV did not answer code.render");
    host.dispose();
    vi.useRealTimers();
  });

  it("stops waiting when disposed", async () => {
    const host = createHost(plugin, frame);
    const answered = host.call("code.render");
    host.dispose();
    await expect(answered).rejects.toThrow("The plugin is closed");
  });
});

describe("app.openUrl", () => {
  const open = (id: number, url: unknown) =>
    send({ mdsilo: 1, id, method: "app.openUrl", params: { url } });

  beforeEach(() => {
    mockInvoke(invoke, { open_url: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens web pages only, one a second", async () => {
    const host = createHost(plugin, frame);
    open(1, "https://bsky.app/intent/compose?text=a%20quote");
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, result: true });
    expect(invoke).toHaveBeenCalledWith("open_url", {
      url: "https://bsky.app/intent/compose?text=a%20quote",
    });
    posted.mockClear();
    open(2, "https://example.org/");
    expect(await answer()).toMatchObject({
      error: "Pages are opened one a second at most",
    });
    vi.setSystemTime(new Date("2026-11-06T10:00:02Z"));
    for (const [id, url] of [
      [3, "file:///etc/passwd"],
      [4, "javascript:alert(1)"],
      [5, "mdsplugin://localhost/x/index.html"],
      [6, "not a url"],
    ] as const) {
      posted.mockClear();
      open(id, url);
      expect((await answer()).error).toMatch(/Only web pages|Not a URL/);
    }
    expect(invoke).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it("from a hidden frame, only while it answers the user", async () => {
    // the last page opened (by the test above) long ago
    vi.setSystemTime(new Date("2026-11-06T10:01:00Z"));
    const host = createHost(plugin, frame, undefined, { hidden: true });
    open(1, "https://example.org/");
    expect(await answer()).toMatchObject({
      error: "A page is opened only while answering the user",
    });
    // asked by the app: an action on the text selected
    const asked = host.call("selection.action", { text: "x" });
    posted.mockClear();
    open(2, "https://example.org/");
    expect(await answer()).toEqual({ mdsilo: 1, id: 2, result: true });
    send({ mdsilo: 1, reply: 1, result: "ok" });
    expect(await asked).toBe("ok");
    host.dispose();
  });
});

describe("markdown.render", () => {
  it("gives HTML as the app reads Markdown, sanitized", async () => {
    const host = createHost(plugin, frame);
    send({
      mdsilo: 1,
      id: 1,
      method: "markdown.render",
      params: { text: "# Hi\n\n**bold** <script>alert(1)</script>" },
    });
    const { result } = await answer();
    expect(result).toContain("<h1");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).not.toContain("<script");
    host.dispose();
  });
});
