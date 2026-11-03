/**
 * The installable web app (PWA) on the page's side: the service worker
 * (web/public/fs-sw.js) keeps the app for offline use, an update waits for
 * the user to reload into it; the install prompt of the browser; and asking
 * the browser to keep the files (IndexedDB) when it is short of storage.
 */
import { create } from "zustand";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaState = {
  /** a new version is installed and waits for a reload */
  updateReady: boolean;
  /** the browser can install the app (Chrome, Edge, Android) */
  canInstall: boolean;
};

export const usePwa = create<PwaState>(() => ({
  updateReady: false,
  canInstall: false,
}));

let installEvent: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;

/** runs as an app of its own: from the home screen, or installed on a desktop */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false)
  );
}

/** iOS and iPadOS: no install prompt, the app is added from the Share menu */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS asks for desktop pages, as a Mac with a touch screen
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** show the install prompt of the browser */
export async function installApp(): Promise<boolean> {
  const event = installEvent;
  if (!event) return false;
  installEvent = null;
  usePwa.setState({ canInstall: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

/** reload into the new version */
export function applyUpdate(): void {
  const worker = waitingWorker;
  if (!worker || typeof navigator === "undefined") {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  worker.postMessage({ type: "skip-waiting" });
}

/**
 * Ask the browser not to evict the workspace (IndexedDB) when storage is
 * short. Safari clears the data of a site not visited for 7 days, unless it
 * is added to the home screen; Chrome grants it to an installed app. Asked
 * only when installed: Firefox would ask the user on every first visit.
 */
export async function persistStorage(): Promise<boolean> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : null;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

function onWaiting(worker: ServiceWorker) {
  waitingWorker = worker;
  usePwa.setState({ updateReady: true });
}

/** track a registration: an update installed, the rest of the app to keep */
export function watchRegistration(reg: ServiceWorkerRegistration): void {
  const sw = navigator.serviceWorker;
  // an update installed while the page was closed
  if (reg.waiting && sw.controller) onWaiting(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      // installed with a page in control: an update, not the first install
      if (worker.state === "installed" && sw.controller) onWaiting(worker);
    });
  });
  // the first install keeps only the shell, then the rest as the app runs
  void sw.ready.then((ready) =>
    ready.active?.postMessage({ type: "precache" }),
  );
  // an app left open for days (a phone) looks for updates when it is back
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck < 60 * 60 * 1000) return;
    lastCheck = Date.now();
    void reg.update().catch(() => {});
  });
}

let listening = false;

/** listen to the install events of the browser, as early as possible */
export function listenInstall(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    // our own button (the logo menu) instead of the mini-infobar
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    usePwa.setState({ canInstall: false });
    void persistStorage();
  });
  if (isStandalone()) void persistStorage();
}

/** the bar of the installed app (status bar, title bar) in the colors of the theme */
export function syncThemeColor(): void {
  if (typeof document === "undefined") return;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-base-200")
    .trim();
  if (!color) return;
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  metas.forEach((meta) => {
    // one for the app's theme, whatever the system's
    meta.removeAttribute("media");
    meta.content = color;
  });
}
