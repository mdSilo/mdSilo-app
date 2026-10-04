/**
 * Browser helpers for the web version
 */

/** URL prefix served by the service worker (web/public/fs-sw.js) from IndexedDB */
export const FS_URL_PREFIX = '__mdsilo_fs__';

function baseUrl(): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** URL to load a file in the virtual file system, e.g. image src */
export function fileUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl()}${FS_URL_PREFIX}${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

/** prefix to resolve `./assets/...` in editor, `${protocol}${rootPath}/assets/...` */
export function assetProtocol(): string {
  return `${window.location.origin}${baseUrl()}${FS_URL_PREFIX}`;
}

let swRegistering: Promise<void> | null = null;

/** register the service worker which serves files in IndexedDB */
export function registerFsServiceWorker(): Promise<void> {
  if (swRegistering) return swRegistering;
  swRegistering = (async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register(`${baseUrl()}fs-sw.js`, { scope: baseUrl() });
    } catch (e) {
      console.warn('Failed to register service worker, local images may not load', e);
    }
  })();
  return swRegistering;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** non-blocking message, stands in for native message dialog */
export function showMessage(title: string, msg: string): void {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '9999',
    maxWidth: '360px',
    padding: '10px 14px',
    borderRadius: '6px',
    background: '#1f2937',
    color: '#f9fafb',
    fontSize: '14px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    wordBreak: 'break-all',
  });
  const strong = document.createElement('strong');
  strong.textContent = title;
  const text = document.createElement('div');
  text.textContent = msg;
  toast.append(strong, text);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
