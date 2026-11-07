/**
 * Web stand-in of `@tauri-apps/api/core`, aliased in vite.web.config.ts.
 * Commands are handled in browser, files are stored in IndexedDB.
 */
import { commands } from "./commands";
import { initFs } from "./fs";
import { fileUrl, registerFsServiceWorker } from "./browser";

void registerFsServiceWorker();

export type InvokeArgs = Record<string, unknown>;

// the commands running, by id: what the app waits on, if it hangs
const running = new Map<number, { cmd: string; since: number }>();
let lastId = 0;

/** The commands running for `ms` or longer, the longest first. */
export function stuckCommands(ms: number): { cmd: string; ms: number }[] {
  const now = Date.now();
  return [...running.values()]
    .map(({ cmd, since }) => ({ cmd, ms: now - since }))
    .filter((c) => c.ms >= ms)
    .sort((a, b) => b.ms - a.ms);
}

export async function invoke<T>(
  cmd: string,
  args: InvokeArgs = {},
): Promise<T> {
  const command = commands[cmd];
  if (!command) {
    throw new Error(`Command ${cmd} is not supported on web`);
  }
  const id = ++lastId;
  running.set(id, { cmd, since: Date.now() });
  try {
    await initFs();
    return (await command(args ?? {})) as T;
  } finally {
    running.delete(id);
  }
}

export function convertFileSrc(filePath: string): string {
  return fileUrl(filePath);
}
