import { describe, expect, test } from 'vitest';
import { store } from './store';
import { Sort, ReadableNameBySort } from './userSettings';

describe('user settings slice', () => {
  test('defaults', () => {
    const s = store.getState();
    expect(s.darkMode).toBe(true);
    expect(s.fontSize).toBe(1.1);
    expect(s.fontWt).toBe(400);
    expect(s.lineHeight).toBe(1.6);
    expect(s.noteSort).toBe(Sort.TitleAscending);
    expect(s.rawMode).toBe('wysiwyg');
    expect(s.recentDir).toEqual([]);
    expect(s.pinnedDir).toBe('');
    expect(s.useAsset).toBe(true);
  });

  test.each([
    ['setDarkMode', 'darkMode', false],
    ['setFont', 'font', 'Sniglet'],
    ['setFontSize', 'fontSize', 1.4],
    ['setNoteSort', 'noteSort', Sort.DateCreatedDescending],
    ['setRawMode', 'rawMode', 'raw'],
    ['setPinnedDir', 'pinnedDir', '/pinned'],
    ['setIsRTL', 'isRTL', true],
    ['setReadMode', 'readMode', true],
  ] as const)('%s updates %s', (setterName, key, value) => {
    (store.getState()[setterName] as (v: unknown) => void)(value);
    expect(store.getState()[key]).toBe(value);
  });

  test('upsertRecentDir moves existing dirs to the end', () => {
    const { upsertRecentDir } = store.getState();
    upsertRecentDir('/a');
    upsertRecentDir('/b');
    upsertRecentDir('/a');
    expect(store.getState().recentDir).toEqual(['/b', '/a']);
  });

  test('deleteRecentDir removes a dir if present', () => {
    const { upsertRecentDir, deleteRecentDir } = store.getState();
    upsertRecentDir('/a');
    upsertRecentDir('/b');
    deleteRecentDir('/a');
    deleteRecentDir('/missing');
    expect(store.getState().recentDir).toEqual(['/b']);
  });

  test('every sort option has a readable name', () => {
    for (const sort of Object.values(Sort)) {
      expect(ReadableNameBySort[sort]).toEqual(expect.any(String));
    }
  });
});
