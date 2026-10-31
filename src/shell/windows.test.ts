import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { emitTo } from '@tauri-apps/api/event';
import { store } from '@/state/store';
import { openFilePath } from '@/workspace/open';
import {
  bookWindowLabel, openBookWindow, readBook, routeBook, routeMain, useViewsOfBookWindows,
} from './windows';

type Handler = (event: { payload: unknown }) => void;
type MockWindow = { label: string; options: Record<string, unknown>; handlers: Map<string, Handler> };
const wins = vi.hoisted(() => ({
  created: [] as MockWindow[],
  listeners: new Map<string, (event: { payload: unknown }) => unknown>(),
}));

vi.mock('@/workspace/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workspace/util')>()),
  isTauri: true,
  isWeb: false,
}));
vi.mock('@/workspace/open', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workspace/open')>()),
  openFilePath: vi.fn(async () => undefined),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    setTitle: async () => undefined,
    unminimize: async () => undefined,
    setFocus: async () => undefined,
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(async () => undefined),
  emitTo: vi.fn(async () => undefined),
  listen: vi.fn(async () => () => undefined),
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    handlers = new Map<string, Handler>();
    constructor(public label: string, public options: Record<string, unknown>) {
      wins.created.push(this);
    }
    once(event: string, handler: Handler) {
      this.handlers.set(event, handler);
      return Promise.resolve(() => undefined);
    }
    unminimize = async () => undefined;
    setFocus = async () => undefined;
  },
  getCurrentWebviewWindow: () => ({
    listen: async (event: string, handler: (event: { payload: unknown }) => unknown) => {
      wins.listeners.set(event, handler);
      return () => wins.listeners.delete(event);
    },
  }),
}));

const close = (win: MockWindow) => win.handlers.get('tauri://destroyed')?.({ payload: undefined });

beforeEach(() => {
  store.getState().setInitDir('/ws');
});

afterEach(() => {
  // closed: forgotten
  wins.created.forEach(close);
  wins.created.length = 0;
  wins.listeners.clear();
  vi.mocked(emitTo).mockClear();
});

describe('bookWindowLabel', () => {
  test('the same for the same book, a valid label', () => {
    const label = bookWindowLabel('/ws/reading/Le Petit Prince (1943).epub');
    expect(label).toBe(bookWindowLabel('/ws/reading/Le Petit Prince (1943).epub'));
    expect(label).not.toBe(bookWindowLabel('/ws/reading/b.epub'));
    expect(label).toMatch(/^[a-zA-Z0-9\-/:_]+$/);
  });
});

describe('book windows', () => {
  test('a book opens in a window of its own, once', () => {
    const path = '/ws/reading/a.epub';
    openBookWindow(path, 'cfi-1');
    expect(wins.created).toHaveLength(1);
    const [win] = wins.created;
    expect(win.label).toBe(bookWindowLabel(path));
    const url = new URL(String(win.options.url), 'http://localhost/');
    // the root: the dev server prepares it only
    expect(url.pathname).toBe('/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ book: path, ws: '/ws', cfi: 'cfi-1' });

    // again: to the front, to the place
    openBookWindow(path, 'cfi-2');
    expect(wins.created).toHaveLength(1);
    expect(emitTo).toHaveBeenCalledWith(win.label, 'mdsilo://goto', 'cfi-2');
    // a link to the book, in the main window: there too
    expect(routeMain({ view: 'book', path })).toBe(true);
    expect(routeMain({ view: 'book', path: '/ws/reading/b.epub' })).toBe(false);
    expect(routeMain({ view: 'graph' })).toBe(false);

    close(win);
    expect(routeMain({ view: 'book', path })).toBe(false);
  });

  test('no window w/o a workspace', () => {
    store.getState().setInitDir(undefined);
    openBookWindow('/a.epub');
    expect(wins.created).toHaveLength(0);
  });

  test('read here, or in a window', () => {
    const dispatch = vi.fn();
    readBook(dispatch, '/ws/reading/a.epub', false);
    expect(dispatch).toHaveBeenCalledWith({ view: 'book', path: '/ws/reading/a.epub' });
    readBook(dispatch, '/ws/reading/a.epub', true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(wins.created).toHaveLength(1);
  });

  test('a book window shows the other views in the main window', () => {
    const route = routeBook('/ws/reading/a.epub');
    expect(route({ view: 'book', path: '/ws/reading/a.epub', cfi: 'x' })).toBe(false);
    const note = { view: 'md', params: { noteId: '/ws/writing/n.md' } } as const;
    expect(route(note)).toBe(true);
    expect(route({ view: 'book', path: '/ws/reading/b.epub' })).toBe(true);
    expect(emitTo).toHaveBeenCalledWith('main', 'mdsilo://view', note);
  });

  test('the main window shows them, a note opened first', async () => {
    const dispatch = vi.fn();
    renderHook(() => useViewsOfBookWindows(dispatch));
    await vi.waitFor(() => expect(wins.listeners.has('mdsilo://view')).toBe(true));
    const note = { view: 'md', params: { noteId: '/ws/writing/n.md' } };
    await wins.listeners.get('mdsilo://view')?.({ payload: note });
    expect(openFilePath).toHaveBeenCalledWith('/ws/writing/n.md', true);
    expect(dispatch).toHaveBeenCalledWith(note);
  });
});
