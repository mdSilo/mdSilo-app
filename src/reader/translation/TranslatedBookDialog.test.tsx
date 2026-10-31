import { Blob as NodeBlob } from 'node:buffer';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { writeFile } from '@/host/web/fs';
import { useWebFs } from '../../testUtils';
import { makeEpub } from '../testBook';
import { readLibrary, type BookEntry } from '../library/library';
import { resetReaderStore, useReaderStore } from '../readerStore';
import { DEFAULT_READER_SETTINGS } from '../settings';
import { useReaderChrome } from '../chrome';
import TranslatedBookDialog from './TranslatedBookDialog';
import { translationsOf } from './translation';

const WS = '/ws';
const BOOK = `${WS}/reading/Tiny Book.epub`;
// a book per test: the translations are kept per book, for the app's life
let HASH = '';
let seq = 0;

beforeEach(async () => {
  HASH = String(++seq).padStart(32, 'e');
  await useWebFs();
  await writeFile(BOOK, new NodeBlob([new Uint8Array(await makeEpub().arrayBuffer())]) as unknown as Blob);
  store.setState({ initDir: WS, readerSettings: { ...DEFAULT_READER_SETTINGS, translateTo: 'fr' } });
  useReaderStore.setState({
    ws: WS, hash: HASH, path: BOOK, format: 'EPUB',
    entry: { hash: HASH, file: 'reading/Tiny Book.epub', title: 'Tiny Book', author: 'Jane Doe', format: 'EPUB', addedAt: '', translate: true } as BookEntry,
  });
  const kept = translationsOf(WS, HASH);
  kept.set('google:fr', 'It was a bright cold day in April.', 'Il faisait froid en avril.');
  await kept.flush();
  useReaderChrome.setState({ translatedBook: true });
});

afterEach(() => {
  resetReaderStore();
  vi.unstubAllGlobals();
});

describe('the translated book', () => {
  test('made of the translations kept, beside the book, in the library; made again, the same book', async () => {
    render(<TranslatedBookDialog />);
    expect(await screen.findByText(/1 of 4 paragraphs translated into Français by Google/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Make the book'));
    });
    expect(await screen.findByText('Saved as Tiny Book.fr.epub')).toBeInTheDocument();
    const target = `${WS}/reading/Tiny Book.fr.epub`;
    expect(await invoke<boolean>('file_exist', { filePath: target })).toBe(true);
    const entries = Object.values((await readLibrary(WS)).books).filter((b) => b.file === 'reading/Tiny Book.fr.epub');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Tiny Book (fr)', author: 'Jane Doe', format: 'EPUB' });

    // more translated, made again: the same entry, the file new
    translationsOf(WS, HASH).set('google:fr', 'Chapter 1', 'Chapitre 1');
    await act(async () => {
      fireEvent.click(screen.getByText('Make the book'));
    });
    const again = Object.values((await readLibrary(WS)).books).filter((b) => b.file === 'reading/Tiny Book.fr.epub');
    expect(again).toHaveLength(1);
    expect(again[0].hash).toBe(entries[0].hash);
  });

  test('a book of another format: an EPUB made of its pages', async () => {
    const page = '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body><p>It was a bright cold day in April.</p><p>Other.</p></body></html>';
    const fb2 = {
      metadata: { title: 'Tiny Book' },
      sections: [{ id: '0', size: 1, createDocument: async () => new DOMParser().parseFromString(page, 'application/xhtml+xml') }],
      toc: [],
      getCover: async () => null,
    };
    useReaderStore.setState({ format: 'FB2', path: `${WS}/reading/Tiny Book.fb2`, book: fb2 as never });
    render(<TranslatedBookDialog />);
    expect(await screen.findByText(/1 of 2 paragraphs translated/)).toBeInTheDocument();
    expect(screen.getByText(/some formatting of the book may differ/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Make the book'));
    });
    expect(await screen.findByText('Saved as Tiny Book.fr.epub')).toBeInTheDocument();
    expect(await invoke<boolean>('file_exist', { filePath: `${WS}/reading/Tiny Book.fr.epub` })).toBe(true);
  });

  test('the rest translated first, then all in the book', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return { ok: true, status: 200, json: async () => [[[`fr: ${q}`, q]], null, 'en'] };
    }));
    render(<TranslatedBookDialog />);
    await screen.findByText(/1 of 4 paragraphs/);
    await act(async () => {
      fireEvent.click(screen.getByText('Translate the rest'));
    });
    expect(await screen.findByText(/4 of 4 paragraphs/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Translate the rest')).not.toBeInTheDocument();
  });

  test('the service refusing: stopped, what was done kept', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) })));
    render(<TranslatedBookDialog />);
    await screen.findByText(/1 of 4 paragraphs/);
    await act(async () => {
      fireEvent.click(screen.getByText('Translate the rest'));
    });
    expect(await screen.findByText(/Stopped: 429 Too Many Requests/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 paragraphs/)).toBeInTheDocument();
  });
});
