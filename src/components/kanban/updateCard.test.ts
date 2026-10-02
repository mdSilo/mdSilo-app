import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import { enterTauri, leaveTauri, mockInvoke } from '../../testUtils';
import type { Kanbans } from './types';

describe('kanban card updates (tauri)', () => {
  let mod: typeof import('./updateCard');
  let store: typeof import('lib/store').store;
  let invoke: Mock;
  let saved: string | undefined;

  const kanbans = (): Kanbans => ({
    default: {
      columns: [{ id: 'c1', title: 'Todo' }],
      cards: [
        { id: 1, columnId: 'c1', content: 'card one', items: [{ name: 'old.md', uri: '/n/old.md', category: 'note' }] },
        { id: 2, columnId: 'c1', content: 'card two' },
      ],
    },
  });

  beforeEach(async () => {
    enterTauri();
    invoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    saved = undefined;
    mockInvoke(invoke, {
      get_data: { status: false },
      read_file: () => JSON.stringify(kanbans()),
      write_file: ({ text }: Record<string, unknown>) => {
        saved = text as string;
      },
    });
    mod = await import('./updateCard');
    store = (await import('lib/store')).store;
    store.getState().setInitDir('/n');
  });

  afterEach(() => {
    leaveTauri();
  });

  const savedCards = () => (JSON.parse(saved as string) as Kanbans).default.cards;

  test('adds a note item to the card', async () => {
    store.getState().setCurrentCard(2);
    await mod.updateCardItems(2, '/n/new.md');
    expect(invoke).toHaveBeenCalledWith('read_file', { filePath: '/n/kanban.json' });
    expect(savedCards()[1].items).toEqual([{ name: 'new.md', uri: '/n/new.md', category: 'note' }]);
    expect(savedCards()[0]).toEqual(kanbans().default.cards[0]);
    expect(store.getState().currentCard).toBeUndefined();
  });

  test('adds an attachment item from [title, path]', async () => {
    await mod.updateCardItems(2, ['Pic', '/n/pic.png']);
    expect(savedCards()[1].items).toEqual([{ name: 'Pic', uri: '/n/pic.png', category: 'attach' }]);
  });

  test('replaces the item with the old title on rename', async () => {
    await mod.updateCardItems(1, '/n/renamed.md', 'old');
    expect(savedCards()[0].items).toEqual([{ name: 'renamed.md', uri: '/n/renamed.md', category: 'note' }]);
  });

  test('does nothing without an init dir or board', async () => {
    store.getState().setInitDir(undefined);
    await mod.updateCardItems(1, '/n/x.md');
    store.getState().setInitDir('/n');
    store.getState().setCurrentBoard('  ');
    await mod.updateCardItems(1, '/n/x.md');
    expect(saved).toBeUndefined();
  });

  test('updateCardLinks replaces old titles and paths', async () => {
    await mod.updateCardLinks('/n/fresh.md', '/n/old.md');
    expect(savedCards()[0].items).toEqual([{ name: 'fresh.md', uri: '/n/fresh.md', category: 'note' }]);
  });

  test('updateCardLinks needs an init dir', async () => {
    store.getState().setInitDir(undefined);
    await mod.updateCardLinks('/n/a.md', '/n/b.md');
    expect(invoke).not.toHaveBeenCalledWith('read_file', expect.anything());
  });
});
