/**
 * Web stand-in of `@tauri-apps/api/window`, aliased in vite.web.config.ts.
 */
import { emit, listen, once } from './event';

const currentWindow = {
  label: 'main',
  listen,
  once,
  emit,
  async setTitle(title: string): Promise<void> {
    document.title = title.trim() || 'mdSilo';
  },
};

export function getCurrentWindow() {
  return currentWindow;
}
