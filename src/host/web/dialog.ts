/**
 * Web stand-in of `@tauri-apps/plugin-dialog`, aliased in vite.web.config.ts.
 */
import { initFs } from './fs';
import { pick } from './picker';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
}

export async function open(options: OpenDialogOptions = {}): Promise<string | string[] | null> {
  await initFs();
  const extensions = options.directory ? [] : (options.filters ?? []).flatMap((f) => f.extensions);
  const res = await pick({
    mode: options.directory ? 'dir' : 'file',
    title: options.title,
    multiple: Boolean(options.multiple),
    extensions,
    defaultPath: options.defaultPath,
  });
  if (!res || res.length === 0) return null;
  return options.multiple && !options.directory ? res : res[0];
}

export async function save(options: SaveDialogOptions = {}): Promise<string | null> {
  await initFs();
  const res = await pick({ mode: 'save', title: options.title, defaultPath: options.defaultPath });
  return res?.[0] ?? null;
}

export async function message(msg: string, options?: { title?: string } | string): Promise<void> {
  const title = typeof options === 'string' ? options : options?.title;
  window.alert(title ? `${title}\n\n${msg}` : msg);
}

export async function ask(msg: string, options?: { title?: string } | string): Promise<boolean> {
  const title = typeof options === 'string' ? options : options?.title;
  return window.confirm(title ? `${title}\n\n${msg}` : msg);
}

export const confirm = ask;
