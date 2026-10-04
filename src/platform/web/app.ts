/**
 * Web stand-in of `@tauri-apps/api/app`, aliased in vite.web.config.ts.
 */

export async function getName(): Promise<string> {
  return 'mdSilo';
}

export async function getVersion(): Promise<string> {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
}

/** no Tauri on web */
export async function getTauriVersion(): Promise<string> {
  return 'N/A (Web)';
}
