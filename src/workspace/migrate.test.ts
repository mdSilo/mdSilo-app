import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { resetIssueStore, issueStore } from '@/issue/issueStore';
import { useWebFs } from '../testUtils';
import {
  dataRoot, detectLayout, newNoteDir, readingRoot, resolveLayout, writingRoot,
} from './layout';
import { migratedPath, migratedRelPath, migrateToWorkspace } from './migrate';

// FileAPI needs Tauri or the web build: on the web file system here too
vi.mock('@/workspace/files', async () => {
  const { invoke } = await import('@tauri-apps/api/core');
  return {
    default: class {
      fileName: string;
      constructor(name: string, parent?: string) {
        this.fileName = parent ? `${parent}/${name}` : name;
      }
      readFile() { return invoke('read_file', { filePath: this.fileName }); }
      writeFile(text: string) { return invoke('write_file', { filePath: this.fileName, text }); }
      deleteFiles() { return invoke('delete_files', { paths: [this.fileName] }); }
    },
  };
});

const write = (filePath: string, text: string) => invoke('write_file', { filePath, text });
const read = (filePath: string) => invoke<string>('read_file', { filePath });
const exists = (filePath: string) => invoke<boolean>('file_exist', { filePath });
const names = async (dir: string) =>
  (await invoke<{ file_name: string }[]>('list_directory', { dir })).map((e) => e.file_name).sort();

beforeEach(async () => {
  await useWebFs();
});

afterEach(() => {
  resetIssueStore();
});

describe('layout', () => {
  test('roots of a workspace and of a legacy folder', () => {
    const ws = { initDir: '/w', layout: 'workspace' as const };
    expect(writingRoot(ws)).toBe('/w/writing');
    expect(readingRoot(ws)).toBe('/w/reading');
    expect(dataRoot(ws)).toBe('/w/.mdsilo');
    const legacy = { initDir: '/w', layout: 'legacy' as const };
    expect(writingRoot(legacy)).toBe('/w');
    expect(readingRoot(legacy)).toBeUndefined();
    expect(dataRoot(legacy)).toBeUndefined();
    expect(writingRoot({})).toBeUndefined();
  });

  test('new notes at the root of a workspace go to writing/', () => {
    const ws = { initDir: '/w', layout: 'workspace' as const };
    expect(newNoteDir('/w', ws)).toBe('/w/writing');
    expect(newNoteDir(undefined, ws)).toBe('/w/writing');
    expect(newNoteDir('/w/reading', ws)).toBe('/w/reading');
    expect(newNoteDir('/w', { initDir: '/w', layout: 'legacy' })).toBe('/w');
  });

  test('the default web workspace has the layout', async () => {
    expect(await detectLayout('/mdSilo')).toBe('workspace');
  });

  test('an empty folder becomes a workspace, one with notes stays legacy', async () => {
    await invoke('create_dir_recursive', { dirPath: '/empty' });
    expect(await resolveLayout('/empty')).toBe('workspace');
    expect(await names('/empty')).toEqual(['reading', 'writing']);
    expect(await read('/empty/.mdsilo/.gitignore')).toBe('local/\n');
    expect(JSON.parse(await read('/empty/.mdsilo/workspace.json')).version).toBe(1);

    await write('/notes/a.md', 'a');
    expect(await resolveLayout('/notes')).toBe('legacy');
    expect(await exists('/notes/.mdsilo')).toBe(false);
  });
});

describe('migration', () => {
  test('paths after migration', () => {
    expect(migratedRelPath('a.md')).toBe('writing/a.md');
    expect(migratedRelPath('sub/b.md')).toBe('writing/sub/b.md');
    expect(migratedRelPath('clips/c.md')).toBe('reading/clips/c.md');
    expect(migratedRelPath('reading/x.epub')).toBe('reading/x.epub');
    expect(migratedPath('/w', '/w/assets/p.png')).toBe('/w/writing/assets/p.png');
    expect(migratedPath('/w', '/elsewhere/n.md')).toBe('/elsewhere/n.md');
  });

  test('moves a legacy workspace into the layout', async () => {
    await write('/w/a.md', '[[b]] ![p](./assets/p.png)');
    await write('/w/sub/b.md', 'b');
    await write('/w/assets/p.png', 'png');
    await write('/w/clips/article.md', 'clip');
    await write('/w/.git/HEAD', 'ref');
    await write('/w/mdsilo.json', '{}');
    await write('/w/issues.json', JSON.stringify({
      nextNumber: 3,
      issues: [
        { number: 1, title: 'one', notes: ['a.md', 'clips/article.md'], noteTask: { note: 'sub/b.md', text: 't' } },
        { number: 2, title: 'two', notes: ['/elsewhere/x.md'] },
      ],
    }));
    store.setState({ initDir: '/w', layout: 'legacy' });

    const result = await migrateToWorkspace('/w');

    expect(result.skipped).toEqual([]);
    expect(result.moved.sort()).toEqual(['a.md', 'assets', 'clips', 'issues.json', 'sub']);
    expect(await detectLayout('/w')).toBe('workspace');
    expect(await names('/w')).toEqual(['reading', 'writing']);
    expect(await names('/w/writing')).toEqual(['a.md', 'assets', 'sub']);
    expect(await read('/w/writing/a.md')).toBe('[[b]] ![p](./assets/p.png)');
    expect(await read('/w/writing/assets/p.png')).toBe('png');
    expect(await read('/w/reading/clips/article.md')).toBe('clip');
    // hidden entries stay, the snapshot is gone, the old data is kept aside
    expect(await read('/w/.git/HEAD')).toBe('ref');
    expect(await exists('/w/mdsilo.json')).toBe(false);
    expect(await exists('/w/.mdsilo/legacy/issues.json')).toBe(true);

    const one = JSON.parse(await read('/w/.mdsilo/issues/1.json'));
    expect(one.notes).toEqual(['writing/a.md', 'reading/clips/article.md']);
    expect(one.noteTask.note).toBe('writing/sub/b.md');
    expect(JSON.parse(await read('/w/.mdsilo/issues/2.json')).notes).toEqual(['/elsewhere/x.md']);
    expect(JSON.parse(await read('/w/.mdsilo/issues/meta.json')).nextNumber).toBe(3);

    // loaded as the workspace now is
    store.setState({ layout: 'workspace' });
    await issueStore.getState().load('/w');
    expect(issueStore.getState().data.issues[0].notes).toEqual([
      '/w/writing/a.md', '/w/reading/clips/article.md',
    ]);
  });

  test('keeps an entry whose target exists, and works without issues', async () => {
    await write('/w/a.md', 'mine');
    await write('/w/writing/a.md', 'already there');
    const result = await migrateToWorkspace('/w');
    expect(result).toEqual({ moved: [], skipped: ['a.md'] });
    expect(await read('/w/a.md')).toBe('mine');
    expect(await read('/w/writing/a.md')).toBe('already there');
    expect(await exists('/w/.mdsilo/issues')).toBe(false);
    expect(await detectLayout('/w')).toBe('workspace');
  });
});
