import { describe, expect, test } from 'vitest';
import * as exts from './file-extensions';

describe('file-extensions', () => {
  test('exports non-empty string lists', () => {
    const lists = Object.entries(exts);
    expect(lists.length).toBeGreaterThan(0);
    for (const [, list] of lists) {
      expect(Array.isArray(list)).toBe(true);
      expect((list as string[]).length).toBeGreaterThan(0);
      for (const ext of list as string[]) {
        expect(typeof ext).toBe('string');
        expect(ext.startsWith('.')).toBe(false);
      }
    }
  });

  test('image extensions include common formats', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']) {
      expect(exts.imageExtensions).toContain(ext);
    }
  });
});
