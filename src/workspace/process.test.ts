import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeFileMeta } from '../testUtils';
import {
  processJson,
  processFiles,
  processDirs,
  rmFileNameExt,
  getFileExt,
  checkFileIsMd,
} from './process';

describe('processJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('parses notes data', () => {
    const data = { isloaded: true, notesobj: { a: { id: 'a' } }, notetree: {} };
    expect(processJson(JSON.stringify(data))).toEqual(data);
  });

  test('returns empty data on invalid json', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(processJson('{not json')).toEqual({ isloaded: false, notesobj: {}, notetree: {} });
    expect(console.log).toHaveBeenCalled();
  });
});

describe('processFiles', () => {
  test('splits markdown notes from other files', () => {
    const files = [
      makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md', file_text: '# A' }),
      makeFileMeta({ file_path: '/n/b.markdown', file_name: 'b.markdown' }),
      makeFileMeta({ file_path: '/n/pic.png', file_name: 'pic.png' }),
    ];
    const [notes, others] = processFiles(files);
    expect(notes.map((n) => n.title)).toEqual(['a', 'b']);
    expect(others.map((n) => n.title)).toEqual(['pic.png']);
  });

  test('maps metadata onto note fields', () => {
    const [[note]] = processFiles([
      makeFileMeta({
        file_path: '/n/a.md',
        file_name: 'a.md',
        file_text: 'hello',
        created: { secs_since_epoch: 0, nanos_since_epoch: 0 },
        last_modified: { secs_since_epoch: 86400, nanos_since_epoch: 0 },
      }),
    ]);
    expect(note).toMatchObject({
      id: '/n/a.md',
      file_path: '/n/a.md',
      title: 'a',
      content: 'hello',
      created_at: '1970-01-01T00:00:00.000Z',
      updated_at: '1970-01-02T00:00:00.000Z',
      is_daily: false,
      cover: '',
    });
  });

  test('flags daily notes by title', () => {
    const [[daily, regular], [nonMd]] = processFiles([
      makeFileMeta({ file_path: '/n/2022-01-01.md', file_name: '2022-01-01.md' }),
      makeFileMeta({ file_path: '/n/2022-01-01 x.md', file_name: '2022-01-01 x.md' }),
      makeFileMeta({ file_path: '/n/2022-01-01.txt.png', file_name: '2022-01-01.png' }),
    ]);
    expect(daily.is_daily).toBe(true);
    expect(regular.is_daily).toBe(false);
    expect(nonMd.is_daily).toBe(false);
  });

  test('skips directories and nameless entries', () => {
    const [notes, others] = processFiles([
      makeFileMeta({ file_name: 'dir', is_dir: true, is_file: false }),
      makeFileMeta({ file_name: '' }),
    ]);
    expect(notes).toEqual([]);
    expect(others).toEqual([]);
  });
});

describe('processDirs', () => {
  test('converts directories into dir notes', () => {
    const dirs = processDirs([
      makeFileMeta({ file_path: '/n/sub', file_name: 'sub', is_dir: true, is_file: false }),
      makeFileMeta({ file_path: '/n/a.md', file_name: 'a.md' }),
      makeFileMeta({ file_path: '/n/x', file_name: '', is_dir: true, is_file: false }),
    ]);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toMatchObject({
      id: '/n/sub',
      title: 'sub',
      file_path: '/n/sub',
      is_dir: true,
      created_at: '2022-01-01T00:00:00.000Z',
    });
  });
});

describe('file name helpers', () => {
  test('rmFileNameExt strips only the last extension', () => {
    expect(rmFileNameExt('/home/user/mdsilo.md')).toBe('/home/user/mdsilo');
    expect(rmFileNameExt('/home/user/md.silo.md')).toBe('/home/user/md.silo');
    expect(rmFileNameExt('mdSilo.md')).toBe('mdSilo');
    expect(rmFileNameExt('md.Silo.md')).toBe('md.Silo');
    expect(rmFileNameExt('/home/user/mdsilo')).toBe('/home/user/mdsilo');
    expect(rmFileNameExt('/home/us.er/mdsilo')).toBe('/home/us.er/mdsilo');
  });

  test('getFileExt returns the extension without dot', () => {
    expect(getFileExt('mdsilo')).toBe('');
    expect(getFileExt('mdsilo.dmg')).toBe('dmg');
    expect(getFileExt('md.silo.dmg')).toBe('dmg');
    expect(getFileExt('.hidden')).toBe('');
  });

  test('checkFileIsMd recognises markdown and text extensions', () => {
    for (const name of ['a.md', 'a.MD', 'a.markdown', 'a.mdown', 'a.mkdn', 'a.mdwn', 'a.txt', 'a.text']) {
      expect(checkFileIsMd(name)).toBe(true);
    }
    for (const name of ['a.json', 'a.png', 'md', 'a.md.bak', 'a.mdx']) {
      expect(checkFileIsMd(name)).toBe(false);
    }
  });
});
