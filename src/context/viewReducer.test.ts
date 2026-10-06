import { describe, expect, test } from 'vitest';
import { store } from 'lib/store';
import { viewReducer, initialState, type ViewAction } from './viewReducer';

describe('viewReducer', () => {
  test.each(['default', 'feed', 'chronicle', 'graph', 'journal'] as const)(
    'switches to %s and clears the current note',
    (view) => {
      store.getState().setCurrentNoteId('/a.md');
      const next = viewReducer({ view: 'md', params: { noteId: '/a.md' } }, { view } as ViewAction);
      expect(next.view).toBe(view);
      expect(store.getState().currentNoteId).toBe('');
    }
  );

  test('md view sets params and the current note', () => {
    const params = { noteId: '/a.md', hash: '0-1' };
    expect(viewReducer(initialState, { view: 'md', params })).toEqual({ view: 'md', params });
    expect(store.getState().currentNoteId).toBe('/a.md');
  });

  test('tag view sets the tag', () => {
    expect(viewReducer(initialState, { view: 'tag', tag: 'todo' })).toEqual({ view: 'tag', tag: 'todo' });
  });

  test('throws on unknown views', () => {
    expect(() => viewReducer(initialState, { view: 'nope' } as unknown as ViewAction)).toThrow();
  });
});
