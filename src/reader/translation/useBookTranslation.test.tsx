import { act, renderHook, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { useWebFs } from '../../testUtils';
import { resetReaderStore, useReaderStore } from '../readerStore';
import { DEFAULT_READER_SETTINGS } from '../settings';
import type { BookEntry } from '../library/library';
import type { FoliateView } from '../view';
import { useBookTranslation } from './useBookTranslation';
import { TRANSLATION_CLASS, translationsOf } from './translation';

const WS = '/ws';
const HASH = 'f'.repeat(32);
const ENTRY = { hash: HASH, file: 'reading/A.epub', title: 'A', author: '', format: 'EPUB', addedAt: '' } as BookEntry;

/** The view of a page of paragraphs, shown from one of them. */
function viewOf(count: number) {
  document.body.innerHTML = Array.from({ length: count }, (_, i) => `<p>Line ${i}</p>`).join('');
  const rangeAt = (i: number) => {
    const range = document.createRange();
    range.selectNodeContents(document.body.children[i]);
    return range;
  };
  const view = Object.assign(new EventTarget(), {
    isFixedLayout: false,
    renderer: { getContents: () => [{ doc: document, index: 1 }] },
    lastLocation: { range: rangeAt(0) },
  }) as unknown as FoliateView;
  const turnTo = (i: number) => view.dispatchEvent(new CustomEvent('relocate', { detail: { range: rangeAt(i) } }));
  return { view, turnTo };
}

const translated = () => Array.from(document.querySelectorAll(`.${TRANSLATION_CLASS}`)).map((el) => el.textContent);

beforeEach(async () => {
  await useWebFs();
  store.setState({ readerSettings: { ...DEFAULT_READER_SETTINGS, translateTo: 'fr' } });
  useReaderStore.setState({ ws: WS, hash: HASH, entry: { ...ENTRY, translate: true } });
  // Google, word for word: "Line 3" to "Ligne 3"
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? '';
    return { ok: true, status: 200, json: async () => [[[q.replace('Line', 'Ligne'), q]], null, 'en'] };
  }));
});

afterEach(() => {
  resetReaderStore();
  vi.unstubAllGlobals();
});

describe('the book translated as it is read', () => {
  test('the page and a few after it; on, as the pages turn; kept; off, gone', async () => {
    const { view, turnTo } = viewOf(20);
    const { rerender } = renderHook(({ v }) => useBookTranslation(v, 'main'), { initialProps: { v: view } });
    // the first page: its paragraph and five after it
    await waitFor(() => expect(translated()).toHaveLength(6));
    expect(translated()[0]).toBe('Ligne 0');

    act(() => {
      turnTo(10);
    });
    await waitFor(() => expect(translated()).toHaveLength(14));
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBe(14);

    // kept: shown again with no translation asked
    const kept = translationsOf(WS, HASH);
    expect(kept.get('google:fr', 'Line 10')).toBe('Ligne 10');
    act(() => useReaderStore.getState().setTranslating(false));
    rerender({ v: view });
    expect(translated()).toEqual([]);
    expect(document.body.innerHTML).not.toContain('Ligne');
    act(() => useReaderStore.getState().setTranslating(true));
    rerender({ v: view });
    await waitFor(() => expect(translated()).toHaveLength(6));
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);

    // written to the workspace
    await kept.flush();
    const file = JSON.parse(await invoke<string>('read_file', { filePath: `${WS}/.mdsilo/translations/${HASH}.json` }));
    expect(file.translations['google:fr']['Line 3']).toBe('Ligne 3');
  });

  test('the translation only: the text hidden; another language, translated again', async () => {
    store.setState({ readerSettings: { ...DEFAULT_READER_SETTINGS, translateTo: 'fr', translationOnly: true } });
    const { view } = viewOf(3);
    renderHook(() => useBookTranslation(view, 'main'));
    await waitFor(() => expect(translated()).toHaveLength(3));
    expect(document.querySelectorAll('[cfi-skip]')).toHaveLength(3);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return { ok: true, status: 200, json: async () => [[[q.replace('Line', 'Zeile'), q]], null, 'en'] };
    });
    act(() => store.setState({ readerSettings: { ...DEFAULT_READER_SETTINGS, translateTo: 'de', translationOnly: true } }));
    await waitFor(() => expect(translated()).toEqual(['Zeile 0', 'Zeile 1', 'Zeile 2']));
  });

  test('a book in the language translated to, as it says: nothing asked', () => {
    const { view } = viewOf(3);
    Object.assign(view, { language: { canonical: 'fr-CA' } });
    renderHook(() => useBookTranslation(view, 'main'));
    expect(fetch).not.toHaveBeenCalled();
  });

  test('not a fixed layout', () => {
    const { view } = viewOf(3);
    (view as unknown as { isFixedLayout: boolean }).isFixedLayout = true;
    renderHook(() => useBookTranslation(view, 'main'));
    expect(fetch).not.toHaveBeenCalled();
  });
});
