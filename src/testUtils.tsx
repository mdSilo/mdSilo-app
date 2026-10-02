/* Shared helpers for unit tests. Not imported by app code. */
import { vi, type Mock } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { store } from 'lib/store';
import { ProvideCurrentView } from 'context/useCurrentView';
import type { Note } from 'types/model';
import type { FileMetaData } from 'file/directory';

const initialState = store.getState();

/** Restore the global zustand store to its pristine state. */
export function resetStore() {
  store.setState(initialState, true);
}

/** Build a Note with sensible defaults. `id` and `file_path` default to each other. */
export function makeNote(partial: Partial<Note> & { id?: string } = {}): Note {
  const id = partial.id ?? partial.file_path ?? `/notes/${partial.title ?? 'note'}.md`;
  return {
    id,
    title: 'note',
    content: '',
    file_path: id,
    cover: '',
    created_at: '2022-01-01T00:00:00.000Z',
    updated_at: '2022-01-01T00:00:00.000Z',
    is_daily: false,
    ...partial,
  };
}

/** Build file metadata as returned by the Rust backend. */
export function makeFileMeta(partial: Partial<FileMetaData> = {}): FileMetaData {
  const time = { secs_since_epoch: 1640995200, nanos_since_epoch: 0 }; // 2022-01-01
  return {
    file_path: '/notes/a.md',
    file_name: 'a.md',
    file_text: '',
    created: time,
    last_modified: time,
    last_accessed: time,
    size: 0,
    readonly: false,
    is_dir: false,
    is_file: true,
    is_hidden: false,
    ...partial,
  };
}

/** Render inside the view context provider the app uses. */
export function renderWithView(ui: ReactElement) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ProvideCurrentView>{children}</ProvideCurrentView>
  );
  return render(ui, { wrapper: Wrapper });
}

type InvokeHandler = unknown | ((args: Record<string, unknown>) => unknown);

/**
 * Route mocked `invoke(cmd, args)` calls to per-command handlers.
 * A handler is either a value or a function receiving the args.
 */
export function mockInvoke(
  invoke: unknown,
  handlers: Record<string, InvokeHandler> = {}
) {
  (invoke as Mock).mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd];
    return typeof handler === 'function' ? handler(args ?? {}) : handler;
  });
}

/**
 * Reload modules as if running inside the Tauri webview.
 * `isTauri` is computed at import time, so modules must be re-imported
 * after calling this. Call `leaveTauri` in afterEach.
 */
export function enterTauri() {
  (window as unknown as Record<string, unknown>).__TAURI__ = {};
  vi.resetModules();
}

export function leaveTauri() {
  delete (window as unknown as Record<string, unknown>).__TAURI__;
  vi.resetModules();
}

/**
 * Give elements a size so virtualized lists (react-virtualized AutoSizer,
 * react-virtual) render their rows in jsdom. Absolutely positioned elements
 * are treated as 32px rows, everything else as a 300x1000 container.
 * Restore with vi.restoreAllMocks().
 */
export function mockLayout() {
  const size = (el: HTMLElement) => (el.style.position === 'absolute' ? 32 : 1000);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return size(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = size(this);
    return { width: 300, height, top: 0, left: 0, bottom: height, right: 300, x: 0, y: 0, toJSON: () => ({}) };
  });
}
