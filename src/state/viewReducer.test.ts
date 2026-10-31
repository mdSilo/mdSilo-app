import { describe, expect, test } from 'vitest';
import { store } from '@/state/store';
import { viewEffects, viewReducer, initialState, type ViewAction } from './viewReducer';

describe('viewReducer', () => {
  test.each(['default', 'feed', 'chronicle', 'graph', 'journal'] as const)(
    'switches to %s and clears the current note',
    (view) => {
      store.getState().setCurrentNoteId('/a.md');
      const next = viewReducer({ view: 'md', params: { noteId: '/a.md' } }, { view } as ViewAction);
      viewEffects({ view } as ViewAction);
      expect(next.view).toBe(view);
      expect(store.getState().currentNoteId).toBe('');
    }
  );

  test.each([
    { view: 'library' },
    { view: 'book', path: '/ws/reading/a.epub' },
    { view: 'vocabulary' },
  ] as ViewAction[])('$view hides the explorer', (action) => {
    store.getState().setIsSidebarOpen(true);
    viewEffects(action);
    expect(store.getState().isSidebarOpen).toBe(false);
  });

  test('a book is kept as the last book of the workspace', () => {
    viewEffects({ view: 'book', path: '/ws/reading/a.epub' });
    expect(store.getState().lastBooks).toEqual({});
    store.getState().setInitDir('/ws');
    viewEffects({ view: 'book', path: '/ws/reading/a.epub' });
    store.getState().setInitDir('/other');
    viewEffects({ view: 'book', path: '/other/reading/b.epub' });
    expect(store.getState().lastBooks).toEqual({
      '/ws': '/ws/reading/a.epub', '/other': '/other/reading/b.epub',
    });
  });

  test('md view sets params and the current note', () => {
    const params = { noteId: '/a.md', hash: '0-1' };
    expect(viewReducer(initialState, { view: 'md', params })).toEqual({ view: 'md', params });
    viewEffects({ view: 'md', params });
    expect(store.getState().currentNoteId).toBe('/a.md');
  });

  test('tag view sets the tag', () => {
    expect(viewReducer(initialState, { view: 'tag', tag: 'todo' })).toEqual({ view: 'tag', tag: 'todo' });
  });

  test('throws on unknown views', () => {
    expect(() => viewReducer(initialState, { view: 'nope' } as unknown as ViewAction)).toThrow();
  });
});
