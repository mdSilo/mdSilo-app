import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { store } from 'lib/store';
import * as ops from './issueOps';
import { issueStore, resetIssueStore, SAVE_DEBOUNCE_MS, useIssueData } from './issueStore';

const files = vi.hoisted(() => ({
  content: {} as Record<string, string | Error>,
  written: [] as { path: string; text: string }[],
  deleted: [] as string[],
  deleteFails: false,
}));

vi.mock('file/files', () => ({
  default: class {
    fileName: string;
    constructor(name: string, parent?: string) {
      this.fileName = parent ? `${parent}/${name}` : name;
    }
    async readFile() {
      const c = files.content[this.fileName];
      if (c instanceof Error) throw c;
      return c ?? '';
    }
    async writeFile(text: string) {
      files.written.push({ path: this.fileName, text });
    }
    async deleteFiles() {
      if (files.deleteFails) throw new Error('nope');
      files.deleted.push(this.fileName);
      return true;
    }
  },
}));

afterEach(() => {
  resetIssueStore();
  files.content = {};
  files.written = [];
  files.deleted = [];
  files.deleteFails = false;
  vi.useRealTimers();
});

describe('issueStore', () => {
  test('missing file gives defaults and writes nothing', async () => {
    await issueStore.getState().load('/w');
    const s = issueStore.getState();
    expect(s.isLoaded).toBe(true);
    expect(s.dir).toBe('/w');
    expect(s.data.projects[0].title).toBe('Default');
    expect(files.written).toEqual([]);
  });

  test('loads and normalizes an existing file', async () => {
    files.content['/w/issues.json'] = JSON.stringify({ issues: [{ number: 3, title: 'x' }], labels: [] });
    await issueStore.getState().load('/w');
    expect(issueStore.getState().data.issues[0].title).toBe('x');
    expect(issueStore.getState().data.nextNumber).toBe(4);
    // a second load of the same dir is a no-op
    files.content['/w/issues.json'] = '';
    await issueStore.getState().load('/w');
    expect(issueStore.getState().data.issues).toHaveLength(1);
    await issueStore.getState().load('/w', true);
    expect(issueStore.getState().data.issues).toHaveLength(0);
  });

  test('corrupt file is backed up and replaced by defaults', async () => {
    files.content['/w/issues.json'] = '{broken';
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await issueStore.getState().load('/w');
    expect(err).toHaveBeenCalled();
    expect(files.written).toEqual([{ path: '/w/issues.json.bak', text: '{broken' }]);
    expect(issueStore.getState().data.labels).toHaveLength(4);
  });

  test('read errors (web) fall back to defaults', async () => {
    files.content['/w/issues.json'] = new Error('no tauri');
    await issueStore.getState().load('/w');
    expect(issueStore.getState().isLoaded).toBe(true);
  });

  test('changes are saved debounced', async () => {
    await issueStore.getState().load('/w');
    vi.useFakeTimers();
    const num = issueStore.getState().createIssue({ title: 'one' });
    issueStore.getState().apply((d) => ops.addComment(d, num, 'hi'));
    issueStore.getState().apply((d) => d); // no change, no save
    expect(num).toBe(1);
    expect(files.written).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS); });
    expect(files.written).toHaveLength(1);
    expect(files.written[0].path).toBe('/w/issues.json');
    const saved = JSON.parse(files.written[0].text);
    expect(saved.issues[0].title).toBe('one');
    expect(saved.issues[0].timeline).toHaveLength(2);
  });

  test('pending changes are flushed before loading another workspace', async () => {
    await issueStore.getState().load('/w');
    issueStore.getState().createIssue({ title: 'one' });
    await issueStore.getState().load('/other');
    expect(files.written.map((w) => w.path)).toEqual(['/w/issues.json']);
    expect(issueStore.getState().dir).toBe('/other');
    expect(issueStore.getState().data.issues).toHaveLength(0);
  });

  test('changes before load are not saved', async () => {
    issueStore.getState().createIssue({ title: 'one' });
    await issueStore.getState().flush();
    expect(files.written).toEqual([]);
  });

  test('migrates kanban.json once into projects', async () => {
    const kanban = JSON.stringify({
      default: { columns: [{ id: 1, title: 'Todo' }], cards: [{ id: 1, columnId: 1, content: 'old card' }] },
    });
    files.content['/w/kanban.json'] = kanban;
    await issueStore.getState().load('/w');
    const { data } = issueStore.getState();
    expect(data.projects.map((p) => p.title)).toEqual(['default']);
    expect(data.issues[0].title).toBe('old card');
    expect(files.written.map((w) => w.path)).toEqual(['/w/issues.json', '/w/kanban.json.bak']);
    expect(JSON.parse(files.written[0].text).issues[0].title).toBe('old card');
    expect(files.written[1].text).toBe(kanban);
    expect(files.deleted).toEqual(['/w/kanban.json']);
  });

  test('migration merges into existing issues and empties kanban.json if it cannot be deleted', async () => {
    files.content['/w/issues.json'] = JSON.stringify({ issues: [{ number: 1, title: 'mine' }], projects: [] });
    files.content['/w/kanban.json'] = JSON.stringify({ b: { columns: [], cards: [{ id: 1, columnId: 1, content: 'c' }] } });
    files.deleteFails = true;
    await issueStore.getState().load('/w');
    const { data } = issueStore.getState();
    expect(data.issues.map((i) => [i.number, i.title])).toEqual([[1, 'mine'], [2, 'c']]);
    expect(data.projects.map((p) => p.title)).toEqual(['b']);
    expect(files.written.at(-1)).toEqual({ path: '/w/kanban.json', text: '{}' });
  });

  test('a failed migration keeps the data unmigrated', async () => {
    files.content['/w/kanban.json'] = JSON.stringify({ b: { columns: [{ id: 1, title: 'X' }], cards: [] } });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const spy = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => { throw new Error('disk full'); });
    await issueStore.getState().load('/w');
    spy.mockRestore();
    expect(err).toHaveBeenCalled();
    expect(issueStore.getState().data.projects.map((p) => p.title)).toEqual(['Default']);
    expect(files.deleted).toEqual([]);
  });

  test('useIssueData loads for initDir', async () => {
    files.content['/w/issues.json'] = JSON.stringify({ issues: [{ number: 1, title: 'x' }] });
    store.getState().setInitDir('/w');
    const { result } = renderHook(() => useIssueData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.data.issues[0].title).toBe('x');
  });
});
