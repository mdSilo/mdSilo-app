// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetStore } from './testUtils';

// Tauri APIs talk to the Rust backend through window.__TAURI_INTERNALS__,
// which does not exist in jsdom. Mock them globally so every module can be
// imported and rendered; individual tests override the return values.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/window', () => {
  const win = {
    setTitle: vi.fn(async () => undefined),
    listen: vi.fn(async () => vi.fn()),
    emit: vi.fn(async () => undefined),
  };
  return { getCurrentWindow: vi.fn(() => win) };
});

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(async () => '0.0.0-test'),
  getTauriVersion: vi.fn(async () => '2.0.0-test'),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

// jsdom lacks ResizeObserver, which headlessui and others rely on
class ResizeObserverStub {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom does not implement layout on Range; editors (CodeMirror, ProseMirror) measure with it
const emptyRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, toJSON: () => ({}) });
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= function () {
    return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect ??= emptyRect as unknown as () => DOMRect;
}
document.elementFromPoint ??= () => null;

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; reset the shared Tauri mocks so
  // per-test mockInvoke/mockResolvedValue setups do not leak into other tests
  const { invoke } = await import('@tauri-apps/api/core');
  vi.mocked(invoke).mockReset().mockImplementation(async () => undefined);
  const dialog = await import('@tauri-apps/plugin-dialog');
  vi.mocked(dialog.open).mockReset().mockImplementation(async () => null);
  vi.mocked(dialog.save).mockReset().mockImplementation(async () => null);
  localStorage.clear();
  resetStore();
});
