import { Blob as NodeBlob } from 'node:buffer';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { store } from 'lib/store';
import { ProvideCurrentView, useCurrentViewContext } from 'context/useCurrentView';
import type { ViewAction } from 'context/viewReducer';
import MainView from 'components/view/MainView';
import useLinkHandlers from 'editor/hooks/useLinkHandlers';
import { useWebFs, waitForView } from '../../testUtils';
import { writeFile } from '../../platform/web/fs';
import { makeEpub } from '../testBook';
import { bookHref } from '../annotations';
import { resetReaderStore, useReaderStore } from '../readerStore';
import { usePopups } from '../popups';
import { resetReaderChrome, useReaderChrome } from '../chrome';
import { DEFAULT_READER_SETTINGS } from '../settings';
import { setView, type FoliateView } from '../view';

// no rendering of the pages in jsdom: a view the panels can drive
const view = vi.hoisted(() => ({
  book: { dir: 'ltr' },
  renderer: {
    scrolled: false,
    prevSection: vi.fn(async () => undefined),
    nextSection: vi.fn(async () => undefined),
  },
  history: { back: vi.fn(), forward: vi.fn(), canGoBack: true, canGoForward: false },
  goTo: vi.fn(async () => undefined),
  prev: vi.fn(async () => undefined),
  next: vi.fn(async () => undefined),
  goToFraction: vi.fn(async () => undefined),
  deselect: vi.fn(),
}));
vi.mock('./FoliateViewer', () => ({
  default: () => <div data-testid="foliate-viewer" />,
}));

const WS = '/mdSilo';

// a binary file in the (fake) IndexedDB: jsdom Blobs do not survive its
// structured clone, Node's do
const writeBook = async (path: string, file: File) =>
  writeFile(path, new NodeBlob([new Uint8Array(await file.arrayBuffer())]) as unknown as Blob);
const BOOK = `${WS}/reading/Tiny Book.epub`;

const Controls = ({ children }: { children: ReactNode }) => {
  const { state, dispatch } = useCurrentViewContext();
  return (
    <>
      <p data-testid="view">{JSON.stringify(state)}</p>
      <button data-testid="go" onClick={(e) => dispatch(JSON.parse((e.target as HTMLElement).dataset.action as string))} />
      {children}
    </>
  );
};

const renderMain = () =>
  render(
    <ProvideCurrentView>
      <Controls><MainView /></Controls>
    </ProvideCurrentView>
  );

const go = async (action: ViewAction) => {
  const btn = screen.getByTestId('go');
  btn.dataset.action = JSON.stringify(action);
  await act(async () => {
    fireEvent.click(btn);
  });
  await waitForView();
};

const viewState = () => JSON.parse(screen.getByTestId('view').textContent as string);

beforeEach(async () => {
  await useWebFs();
  store.setState({ initDir: WS, layout: 'workspace', readerSettings: DEFAULT_READER_SETTINGS });
  await writeBook(BOOK, makeEpub());
  setView(view as unknown as FoliateView);
});

afterEach(() => {
  resetReaderStore();
  resetReaderChrome();
  usePopups.getState().clear();
  setView(null);
});

describe('reader', () => {
  test('shows a book with its contents', async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    expect(screen.getAllByText('Tiny Book').length).toBeGreaterThan(0);
    // the sidebar, open at first (not on mobile), toggled and resized
    expect(screen.getByTestId('reader-toc')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Contents and notes'));
    expect(screen.queryByTestId('reader-toc')).not.toBeInTheDocument();
    expect(store.getState().readerSettings.showSidebar).toBe(false);
    fireEvent.click(screen.getByTitle('Contents and notes'));
    const handle = screen.getByLabelText('Resize contents');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(store.getState().readerSidebarWidth).toBe(304);
    expect(screen.getByTestId('reader-sidebar')).toHaveStyle({ width: '304px' });
    fireEvent.click(screen.getByText('Chapter Two'));
    expect(view.goTo).toHaveBeenCalledWith('OEBPS/c2.xhtml');

    act(() => {
      useReaderStore.getState().setLocation({
        cfi: 'epubcfi(/6/4!/4/2)', fraction: 0.25, tocLabel: 'Chapter One', tocHref: 'OEBPS/c1.xhtml',
        location: { current: 9, total: 40 }, time: { section: 3.2, total: 30 }, page: 1, pages: 4,
      });
    });
    expect(screen.getByTestId('reader-progress')).toHaveTextContent('25%');
    // in the margins: the chapter, the progress
    expect(screen.getByTestId('reader-section')).toHaveTextContent('Chapter One');
    expect(screen.getByTestId('reader-progress-info')).toHaveTextContent('3 min left in chapter · 2 pages');
    expect(screen.getByTestId('reader-progress-info')).toHaveTextContent('10 / 40 · 25%');
    // the chapter read, in the contents
    expect(screen.getByTestId('reader-toc').querySelector('[aria-current]')).toHaveTextContent('Chapter One');

    // the bars, and their buttons
    expect(screen.queryByTitle('Next page')).not.toBeInTheDocument();
    act(() => useReaderChrome.getState().setBarsVisible(true));
    expect(screen.queryByTestId('reader-section')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Next page'));
    expect(view.next).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Previous chapter'));
    expect(view.renderer.prevSection).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Go back'));
    expect(view.history.back).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Library'));
    await waitForView();
    expect(viewState().view).toBe('library');
  });

  test('highlights the text selected, with a note', async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    act(() => {
      useReaderStore.getState().setLocation({ cfi: 'epubcfi(/6/4!/4/2)', fraction: 0.1, tocLabel: 'Chapter One' });
      usePopups.getState().setSelection({
        text: 'a bright cold day', cfi: 'epubcfi(/6/4!/4/4,/1:9,/1:26)', index: 1,
        box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    // highlighted as the last time: the style and color then shown, to change
    fireEvent.click(await screen.findByLabelText('Highlight'));
    expect(screen.queryByTestId('selection-popup')).not.toBeInTheDocument();
    expect(useReaderStore.getState().notes[0]).toMatchObject({
      text: 'a bright cold day', color: 'yellow', style: 'highlight', chapter: 'Chapter One',
    });
    expect(screen.getByTestId('highlight-options')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Highlight green'));
    expect(useReaderStore.getState().notes[0]).toMatchObject({ color: 'green' });
    expect(screen.queryByTestId('annotation-popup')).not.toBeInTheDocument();
    expect(store.getState().readerSettings.highlightColors.highlight).toBe('green');

    // its note, in the panel
    fireEvent.click(screen.getByRole('tab', { name: /Notes/ }));
    expect(screen.getByTestId('reader-notes')).toHaveTextContent('a bright cold day');
    fireEvent.click(screen.getByTitle('Edit the note'));
    const textarea = document.querySelector('[data-testid="reader-notes"] textarea')!;
    fireEvent.change(textarea, { target: { value: 'See [[1984]]' } });
    fireEvent.blur(textarea);
    expect(useReaderStore.getState().notes[0].note).toBe('See [[1984]]');

    await act(async () => { await useReaderStore.getState().flush(); });
    const md = await invoke<string>('read_file', { filePath: `${BOOK}.md` });
    expect(md).toContain('> a bright cold day\n\nSee [[1984]]');

    // a bookmark
    fireEvent.click(screen.getByTitle('Bookmark this page'));
    expect(useReaderStore.getState().notes.map((n) => n.type)).toEqual(['annotation', 'bookmark']);
    expect(screen.getByTestId('reader-ribbon')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Bookmark this page'));
    expect(useReaderStore.getState().notes.map((n) => n.type)).toEqual(['annotation']);
  });

  test('edits an annotation clicked', async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    const now = new Date().toISOString();
    act(() => {
      useReaderStore.getState().addNote({
        id: 'x', type: 'annotation', cfi: 'epubcfi(/6/4!/4/4,/1:0,/1:2)', text: 'It', note: '',
        color: 'yellow', style: 'highlight', createdAt: now, updatedAt: now,
      });
      usePopups.getState().setAnnotation({ id: 'x', box: { left: 0, top: 0, right: 10, bottom: 10 } });
    });
    expect(screen.getByTestId('annotation-popup')).toBeInTheDocument();
    // underlined: in the color of underlines
    fireEvent.click(screen.getByLabelText('Style underline'));
    expect(useReaderStore.getState().notes[0]).toMatchObject({ color: 'green', style: 'underline' });
    expect(store.getState().readerSettings.highlightStyle).toBe('underline');

    // a note written
    fireEvent.click(screen.getByLabelText('Write a note'));
    fireEvent.change(screen.getByPlaceholderText(/A note/), { target: { value: 'Orwell' } });
    fireEvent.click(screen.getByText('Save'));
    expect(useReaderStore.getState().notes[0].note).toBe('Orwell');
    act(() => {
      usePopups.getState().setAnnotation({ id: 'x', box: { left: 0, top: 0, right: 10, bottom: 10 } });
    });
    expect(screen.getByTestId('note-card')).toHaveTextContent('Orwell');

    fireEvent.click(screen.getByLabelText('Delete the highlight'));
    expect(useReaderStore.getState().notes).toEqual([]);
    expect(screen.queryByTestId('annotation-popup')).not.toBeInTheDocument();
  });

  test('a note on the text selected, cancelled: no highlight', async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    act(() => {
      usePopups.getState().setSelection({
        text: 'cold', cfi: 'epubcfi(/6/4!/4/4,/1:9,/1:13)', index: 1, box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    fireEvent.click(screen.getByLabelText('Write a note'));
    expect(useReaderStore.getState().notes).toHaveLength(1);
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(useReaderStore.getState().notes).toEqual([]);
  });

  test('searches the text selected', async () => {
    const search = vi.fn(async function* () { yield 'done' as const; });
    Object.assign(view, { search, clearSearch: vi.fn() });
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    act(() => {
      usePopups.getState().setSelection({
        text: ' cold ', cfi: 'epubcfi(/6/4!/4/4,/1:9,/1:13)', index: 1, box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Search it in the book'));
    });
    expect(screen.getByLabelText('Search in the book')).toHaveValue('cold');
    expect(search).toHaveBeenCalledWith({ query: 'cold', matchCase: false, matchWholeWords: false });
  });

  test('a book that does not open', async () => {
    await invoke('write_file', { filePath: `${WS}/reading/Broken.epub`, text: 'not a zip' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderMain();
    await go({ view: 'book', path: `${WS}/reading/Broken.epub` });
    expect(await screen.findByText('Could not open the book')).toBeInTheDocument();
    err.mockRestore();
  });
});

describe('reader settings menu', () => {
  const openMenu = () => fireEvent.click(screen.getByTitle('Font and layout'));
  const menu = () => screen.queryByTestId('reader-settings');

  test('closes on a click outside, also over the book', async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());

    // over the book: the backdrop takes the click
    openMenu();
    expect(menu()).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('reader-menu-backdrop'));
    expect(menu()).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('reader-menu-backdrop'));
    expect(menu()).not.toBeInTheDocument();

    // on the bars or the sidebar, above the backdrop
    openMenu();
    fireEvent.pointerDown(screen.getByTestId('reader-sidebar'));
    expect(menu()).not.toBeInTheDocument();

    // not inside the menu
    openMenu();
    fireEvent.pointerDown(screen.getByText('Scroll'));
    fireEvent.click(screen.getByText('Scroll'));
    expect(menu()).toBeInTheDocument();
  });
});

describe('reader on mobile', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  test('hides the sidebar at first, w/o changing the setting', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    expect(screen.queryByTestId('reader-sidebar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Contents and notes'));
    expect(screen.getByTestId('reader-toc')).toBeInTheDocument();
    expect(store.getState().readerSettings.showSidebar).toBe(true);
  });
});

describe('library', () => {
  test('lists the books, opens one, syncs it or not', async () => {
    renderMain();
    await go({ view: 'library' });
    const card = await screen.findByText('Tiny Book');
    expect(screen.getAllByText('EPUB').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle(/click to sync the book file too/));
    await waitFor(() => expect(screen.getByTitle(/click to stop/)).toBeInTheDocument());
    expect(await invoke<string>('read_file', { filePath: `${WS}/reading/.gitignore` })).toContain('!/Tiny Book.epub');

    fireEvent.click(card);
    await waitForView();
    expect(viewState()).toMatchObject({ view: 'book', bookPath: BOOK });
  });

  test('reads the titles of the books never opened', async () => {
    await writeBook(`${WS}/reading/sub/file-name.epub`, makeEpub('Real Title'));
    renderMain();
    await go({ view: 'library' });
    expect(await screen.findByText('Real Title')).toBeInTheDocument();
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    const lib = JSON.parse(await invoke<string>('read_file', { filePath: `${WS}/.mdsilo/books.json` }));
    expect(Object.values(lib.books).map((b) => (b as { title: string }).title).sort()).toEqual(['Real Title', 'Tiny Book']);
  });

  test('adds books from the device', async () => {
    await writeBook('/downloads/Other.epub', makeEpub('Other'));
    vi.mocked(dialog.open).mockResolvedValueOnce(['/downloads/Other.epub']);
    renderMain();
    await go({ view: 'library' });
    await screen.findByText('Tiny Book');
    await act(async () => {
      fireEvent.click(screen.getByText('Add books'));
    });
    await waitForView();
    // one book added: read
    await waitFor(() => expect(viewState()).toMatchObject({ view: 'book', bookPath: `${WS}/reading/Other.epub` }));
  });
});

describe('links to books', () => {
  const LinkOpener = ({ href }: { href: string }) => {
    const { onOpenLink } = useLinkHandlers();
    return <button onClick={() => void onOpenLink(href)}>open link</button>;
  };

  test('open the book at the place', async () => {
    const hash = await invoke<string>('book_hash', { filePath: BOOK });
    render(
      <ProvideCurrentView>
        <Controls><LinkOpener href={bookHref(hash, 'epubcfi(/6/4!/4/2)')} /></Controls>
      </ProvideCurrentView>
    );
    await act(async () => {
      fireEvent.click(screen.getByText('open link'));
    });
    // not in the library yet: found in reading/
    await waitFor(() => expect(viewState()).toMatchObject({
      view: 'book', bookPath: BOOK, bookCfi: 'epubcfi(/6/4!/4/2)',
    }));
  });

  test('a book not on this device', async () => {
    render(
      <ProvideCurrentView>
        <Controls><LinkOpener href={bookHref('f'.repeat(32))} /></Controls>
      </ProvideCurrentView>
    );
    await act(async () => {
      fireEvent.click(screen.getByText('open link'));
    });
    expect(viewState().view).toBe('default');
  });
});

describe('reader, the second part', () => {
  const openBook = async () => {
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('searches the book', async () => {
    const search = vi.fn(async function* () {
      yield { progress: 0.5 };
      yield { index: 1, label: 'Chapter One', subitems: [{ cfi: 'epubcfi(/6/4!/4/4,/1:2,/1:7)', excerpt: { pre: 'It ', match: 'was a', post: ' bright' } }] };
      yield 'done' as const;
    });
    Object.assign(view, { search, clearSearch: vi.fn() });
    await openBook();
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
    fireEvent.change(screen.getByLabelText('Search in the book'), { target: { value: 'was a' } });
    fireEvent.click(screen.getByLabelText('Match case'));
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Search in the book').closest('form')!);
    });
    expect(search).toHaveBeenCalledWith({ query: 'was a', matchCase: true, matchWholeWords: false });
    expect(await screen.findByText('1 found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('was a'));
    expect(view.goTo).toHaveBeenCalledWith('epubcfi(/6/4!/4/4,/1:2,/1:7)');
    // the highlights of the matches go with the tab
    fireEvent.click(screen.getByRole('tab', { name: 'Contents' }));
    expect((view as unknown as { clearSearch: () => void }).clearSearch).toHaveBeenCalled();
  });

  test('looks up the text selected, and keeps it as a note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => [[['un jour froid', 'a cold day']], null, 'en'],
    })));
    await openBook();
    act(() => {
      usePopups.getState().setSelection({
        text: 'a bright cold day', cfi: 'epubcfi(/6/4!/4/4,/1:9,/1:26)', index: 1,
        box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    // more than a few words: no dictionary
    expect(screen.queryByLabelText('Look it up in Wiktionary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Translate it'));
    expect(await screen.findByText('un jour froid')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Keep as note'));
    expect(useReaderStore.getState().notes[0]).toMatchObject({ text: 'a bright cold day', note: 'un jour froid' });
    expect(screen.queryByTestId('lookup-popup')).not.toBeInTheDocument();
  });

  test('a lookup failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await openBook();
    act(() => {
      usePopups.getState().setSelection({
        text: 'cold', cfi: 'epubcfi(/6/4!/4/4,/1:9,/1:13)', index: 1, box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    fireEvent.click(screen.getByLabelText('Look it up in Wiktionary'));
    expect(await screen.findByText('Could not look it up: offline')).toBeInTheDocument();
  });
});
