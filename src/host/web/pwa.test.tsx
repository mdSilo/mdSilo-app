import { afterEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import PwaPrompts from "@/shell/PwaPrompts";
import {
  injectPrecache,
  precacheOf,
  PRECACHE_MARKER,
} from "../../../web/pwa-precache.mjs";
import {
  applyUpdate,
  installApp,
  isIos,
  listenInstall,
  persistStorage,
  syncThemeColor,
  usePwa,
  watchRegistration,
} from "./pwa";

afterEach(() => {
  usePwa.setState({ updateReady: false, canInstall: false });
});

describe("precache list of the build", () => {
  const html = `<script type="module" src="/assets/index-a1.js"></script>
    <link rel="modulepreload" href="/assets/react-b2.js">
    <link rel="stylesheet" href="/assets/index-c3.css">
    <link rel="manifest" href="/manifest.webmanifest" />`;
  const files = [
    "index.html",
    "fs-sw.js",
    "manifest.webmanifest",
    "assets/index-a1.js",
    "assets/react-b2.js",
    "assets/index-c3.css",
    "assets/Graph-d4.js",
    "assets/Graph-d4.js.map",
    "demo/alice.epub",
    "vendor/pdfjs/pdf.worker.min.mjs",
    "vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap",
    "vendor/pdfjs/standard_fonts/FoxitSans.pfb",
  ];
  const read = (f: string) => (f === "index.html" ? html : `content of ${f}`);

  test("the shell first, the views later, never the worker itself", () => {
    const build = precacheOf(files, read);
    expect(build.core).toEqual([
      "index.html",
      "manifest.webmanifest",
      "assets/index-a1.js",
      "assets/react-b2.js",
      "assets/index-c3.css",
    ]);
    expect(build.rest.sort()).toEqual([
      "assets/Graph-d4.js",
      "vendor/pdfjs/pdf.worker.min.mjs",
    ]);
  });

  test("from a sub path", () => {
    const sub = html.replaceAll('"/', '"/mdsilo/');
    const build = precacheOf(
      files,
      (f) => (f === "index.html" ? sub : f),
      "/mdsilo/",
    );
    expect(build.core).toContain("assets/index-a1.js");
  });

  test("a new version with any file changed", () => {
    const a = precacheOf(files, read).version;
    expect(precacheOf(files, read).version).toBe(a);
    const changed = (f: string) =>
      f === "assets/Graph-d4.js" ? "new" : read(f);
    expect(precacheOf(files, changed).version).not.toBe(a);
    // not for a file not kept
    const demo = (f: string) => (f === "demo/alice.epub" ? "new" : read(f));
    expect(precacheOf(files, demo).version).toBe(a);
  });

  test("written into the worker", () => {
    const code = `x;\n${PRECACHE_MARKER}\ny;`;
    const build = { version: "v1", core: ["index.html"], rest: [] };
    expect(injectPrecache(code, build)).toContain(
      'const BUILD = {"version":"v1","core":["index.html"],"rest":[]};',
    );
    expect(() => injectPrecache("no marker", build)).toThrow();
  });

  test("the worker in web/public has the marker", async () => {
    const fs = await import("node:fs");
    const code = fs.readFileSync("web/public/fs-sw.js", "utf8");
    expect(code).toContain(PRECACHE_MARKER);
  });
});

describe("install", () => {
  test("the browser's prompt, from our own button", async () => {
    listenInstall();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    const prevent = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(prevent).toHaveBeenCalled();
    expect(usePwa.getState().canInstall).toBe(true);
    expect(await installApp()).toBe(true);
    expect(prompt).toHaveBeenCalled();
    expect(usePwa.getState().canInstall).toBe(false);
    // once only
    expect(await installApp()).toBe(false);
  });

  test("iOS and iPadOS", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get");
    ua.mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    );
    expect(isIos()).toBe(true);
    ua.mockReturnValue("Mozilla/5.0 (X11; Linux x86_64)");
    expect(isIos()).toBe(false);
    ua.mockRestore();
  });

  test("asks to keep the files", async () => {
    const persist = vi.fn(async () => true);
    const persisted = vi.fn(async () => false);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist, persisted },
    });
    expect(await persistStorage()).toBe(true);
    expect(persist).toHaveBeenCalled();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
    expect(await persistStorage()).toBe(false);
  });
});

describe("updates", () => {
  type Listener = () => void;
  const fakeWorker = () => {
    const listeners: Listener[] = [];
    return {
      state: "installing",
      postMessage: vi.fn(),
      addEventListener: (_: string, fn: Listener) => listeners.push(fn),
      fire() {
        listeners.forEach((fn) => fn());
      },
    };
  };
  const fakeSw = (controller: unknown) => {
    const listeners: Record<string, Listener[]> = {};
    const active = { postMessage: vi.fn() };
    const sw = {
      controller,
      ready: Promise.resolve({ active }),
      addEventListener: (type: string, fn: Listener) =>
        (listeners[type] ??= []).push(fn),
      fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
      active,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: sw,
    });
    return sw;
  };

  test("an update installed: offered, then reloaded into", async () => {
    const sw = fakeSw({});
    const worker = fakeWorker();
    const regListeners: Listener[] = [];
    const reg = {
      waiting: null,
      installing: worker,
      update: vi.fn(async () => {}),
      addEventListener: (_: string, fn: Listener) => regListeners.push(fn),
    };
    watchRegistration(reg as unknown as ServiceWorkerRegistration);
    // the rest of the app is asked for
    await Promise.resolve();
    await Promise.resolve();
    expect(sw.active.postMessage).toHaveBeenCalledWith({ type: "precache" });

    regListeners.forEach((fn) => fn());
    worker.state = "installed";
    worker.fire();
    expect(usePwa.getState().updateReady).toBe(true);

    const reload = vi.fn();
    const location = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...location, reload },
    });
    applyUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "skip-waiting" });
    sw.fire("controllerchange");
    sw.fire("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: location,
    });
  });

  test("the first install is no update", () => {
    fakeSw(null);
    const worker = fakeWorker();
    const regListeners: Listener[] = [];
    const reg = {
      waiting: null,
      installing: worker,
      update: vi.fn(),
      addEventListener: (_: string, fn: Listener) => regListeners.push(fn),
    };
    watchRegistration(reg as unknown as ServiceWorkerRegistration);
    regListeners.forEach((fn) => fn());
    worker.state = "installed";
    worker.fire();
    expect(usePwa.getState().updateReady).toBe(false);
  });

  test("the prompt: shown when ready, put off by Later", () => {
    render(<PwaPrompts />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => usePwa.setState({ updateReady: true }));
    expect(screen.getByRole("status")).toHaveTextContent("A new version");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

test("the bar of the app in the colors of the theme", () => {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.media = "(prefers-color-scheme: light)";
  meta.content = "#fafafa";
  document.head.append(meta);
  document.documentElement.style.setProperty("--color-base-200", "#123456");
  syncThemeColor();
  expect(meta.content).toBe("#123456");
  expect(meta.hasAttribute("media")).toBe(false);
  meta.remove();
  document.documentElement.style.removeProperty("--color-base-200");
});
