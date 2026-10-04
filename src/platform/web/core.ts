/**
 * Web stand-in of `@tauri-apps/api/core`, aliased in vite.web.config.ts.
 * Commands are handled in browser, files are stored in IndexedDB.
 */
import { commands } from './commands';
import { initFs } from './fs';
import { fileUrl, registerFsServiceWorker } from './browser';

void registerFsServiceWorker();

export type InvokeArgs = Record<string, unknown>;

export async function invoke<T>(cmd: string, args: InvokeArgs = {}): Promise<T> {
  const command = commands[cmd];
  if (!command) {
    throw new Error(`Command ${cmd} is not supported on web`);
  }
  await initFs();
  return (await command(args ?? {})) as T;
}

export function convertFileSrc(filePath: string): string {
  return fileUrl(filePath);
}
