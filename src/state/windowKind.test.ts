import { describe, expect, test } from 'vitest';
import { bookWindowParams, isBookWindow } from './windowKind';

describe('bookWindowParams', () => {
  test('the book, its workspace and place, from the URL', () => {
    expect(bookWindowParams('?book=%2Fws%2Freading%2Fa%20b.epub&ws=%2Fws')).toEqual({
      path: '/ws/reading/a b.epub', ws: '/ws',
    });
    expect(bookWindowParams('?book=%2Fa.epub&ws=%2Fws&cfi=epubcfi(%2F6%2F4)')).toEqual({
      path: '/a.epub', ws: '/ws', cfi: 'epubcfi(/6/4)',
    });
  });

  test('none without a book and a workspace', () => {
    expect(bookWindowParams('')).toBeUndefined();
    expect(bookWindowParams('?book=%2Fa.epub')).toBeUndefined();
    expect(isBookWindow).toBe(false);
  });
});
