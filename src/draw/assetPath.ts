/**
 * Where Excalidraw loads its fonts from: the app (vite.config.mts serves
 * and emits them under `vendor/excalidraw/`), not its CDN, to draw offline.
 * Imported before Excalidraw.
 */
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = new URL(
    `${import.meta.env.BASE_URL ?? "/"}vendor/excalidraw/`,
    window.location.origin,
  ).href;
}

export {};
