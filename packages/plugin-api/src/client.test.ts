import { applyStyle, createClient } from "./client";
import { PROTOCOL } from "./protocol";

/** the app, seen from the page of a plugin */
function fakeApp() {
  const sent: Record<string, unknown>[] = [];
  const target = {
    postMessage: (message: Record<string, unknown>) => sent.push(message),
  };
  const source = new EventTarget();
  const send = (data: unknown) =>
    source.dispatchEvent(new MessageEvent("message", { data }));
  const client = createClient({
    target: target as unknown as Window,
    source: source as unknown as Window,
  });
  return { sent, send, client };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("calls the app and gets its answer", async () => {
  const { sent, send, client } = fakeApp();
  const read = client.call("notes.read", { path: "a.md" });
  expect(sent).toEqual([
    {
      mdsilo: PROTOCOL,
      id: 1,
      method: "notes.read",
      params: { path: "a.md" },
    },
  ]);
  send({ mdsilo: 1, id: 1, result: "# A" });
  await expect(read).resolves.toBe("# A");

  const write = client.call("file.write", { text: "x" });
  send({ mdsilo: 1, id: 2, error: "Not permitted: file:write" });
  await expect(write).rejects.toThrow("Not permitted: file:write");
});

it("leaves out what is not for it", async () => {
  const { send, client } = fakeApp();
  let done = false;
  void client.call("app.info").then(() => (done = true));
  send({ mdsilo: 2, id: 1, result: {} });
  send({ id: 1, result: {} });
  send("text");
  await flush();
  expect(done).toBe(false);
});

it("gives up after the timeout, if any", async () => {
  vi.useFakeTimers();
  try {
    const sent: unknown[] = [];
    const client = createClient({
      target: {
        postMessage: (m: unknown) => sent.push(m),
      } as unknown as Window,
      source: new EventTarget() as unknown as Window,
      timeout: 1000,
    });
    const info = client.call("app.info");
    vi.advanceTimersByTime(1000);
    await expect(info).rejects.toThrow("No answer to app.info");
  } finally {
    vi.useRealTimers();
  }
});

it("tells of the events of the app", () => {
  const { send, client } = fakeApp();
  const changed = vi.fn();
  const stop = client.on("note.changed", changed);
  send({ mdsilo: 1, event: "note.changed" });
  send({ mdsilo: 1, event: "file.changed" });
  stop();
  send({ mdsilo: 1, event: "note.changed" });
  expect(changed).toHaveBeenCalledTimes(1);
});

it("answers what the app asks", async () => {
  const { sent, send, client } = fakeApp();
  client.handle("code.render", ({ code }) => `<svg>${code}</svg>`);
  client.handle("command.run", () => {
    throw new Error("Broken");
  });
  send({
    mdsilo: 1,
    request: 7,
    method: "code.render",
    params: { lang: "bars", code: "a: 1", dark: false },
  });
  send({ mdsilo: 1, request: 8, method: "command.run", params: {} });
  send({ mdsilo: 1, request: 9, method: "selection.action", params: {} });
  await flush();
  // answered as they are done, not in order
  expect(sent.sort((a, b) => Number(a.reply) - Number(b.reply))).toEqual([
    { mdsilo: 1, reply: 7, result: "<svg>a: 1</svg>" },
    { mdsilo: 1, reply: 8, error: "Broken" },
    { mdsilo: 1, reply: 9, error: "Unknown method: selection.action" },
  ]);
});

it("rejects the calls waiting when closed", async () => {
  const { client } = fakeApp();
  const info = client.call("app.info");
  client.close();
  await expect(info).rejects.toThrow("closed");
});

it("applies the look of the app", () => {
  const el = document.createElement("div");
  applyStyle(
    {
      theme: "user-x",
      dark: true,
      vars: { "--color-base-100": "#000" },
      font: "'Noto Serif'",
    },
    el,
  );
  expect(el.style.getPropertyValue("--color-base-100")).toBe("#000");
  expect(el.style.fontFamily).toContain("Noto Serif");
  expect(el.dataset.theme).toBe("user-x");
});
