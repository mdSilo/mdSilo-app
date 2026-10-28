import { Blob as NodeBlob } from 'node:buffer';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { store } from '@/state/store';
import { ProvideCurrentView, useCurrentViewContext } from '@/state/useCurrentView';
import type { ViewAction } from '@/state/viewReducer';
import MainView from '@/shell/MainView';
import useLinkHandlers from '@/writer/hooks/useLinkHandlers';
import { writeFile } from '@/host/web/fs';
import { useWebFs, waitForView } from '../../testUtils';
import { makeEpub } from '../testBook';
import { bookHref } from '../annotations';
import { resetReaderStore, useReaderStore, useSideStore } from '../readerStore';
import { usePopups } from '../popups';
import { resetReaderChrome, useReaderChrome } from '../chrome';
import { DEFAULT_READER_SETTINGS } from '../settings';
import { DEFAULT_LIBRARY_SETTINGS } from '../shelf';
import { readLibrary, refreshLibrary, setBooksGroup } from '../library';
import { resetVocabulary, useVocabulary } from '../vocabulary';
import { setActivePane, setView, type FoliateView } from '../view';

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
  default: ({ pane = 'main' }: { pane?: string }) => <div data-testid={pane === 'side' ? 'side-viewer' : 'foliate-viewer'} />,
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
  store.setState({
    initDir: WS, layout: 'workspace', readerSettings: DEFAULT_READER_SETTINGS, librarySettings: DEFAULT_LIBRARY_SETTINGS,
  });
  await writeBook(BOOK, makeEpub());
  setView(view as unknown as FoliateView);
});

afterEach(() => {
  resetReaderStore();
  resetReaderChrome();
  resetVocabulary();
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
    expect(screen.getByTestId('reader-progress-info')).toHaveTextContent('3 min § 2 pages');
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

describe('parallel reading', () => {
  const OTHER = `${WS}/reading/Other Book.epub`;

  test('a book beside, picked from the library, annotated as it is, closed', async () => {
    await writeBook(OTHER, makeEpub('Other Book'));
    await writeBook(`${WS}/reading/Scan.pdf`, new File(['%PDF'], 'Scan.pdf'));
    await refreshLibrary(WS);
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Parallel reading'));
    const list = await screen.findByTestId('parallel-books');
    // the other books, a PDF too: not the one read
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2));
    fireEvent.click(within(list).getByText('Other Book'));
    expect(screen.queryByTestId('parallel-books')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('side-viewer')).toBeInTheDocument());
    expect(useSideStore.getState().path).toBe(OTHER);
    const pane = screen.getByTestId('parallel-pane');
    // the title, with the chapter after it
    expect(within(pane).getByTitle('Other Book')).toHaveTextContent(/^Other Book §/);
    // in the library, as any book read
    expect(Object.values((await readLibrary(WS)).books).map((b) => b.title)).toContain('Other Book');

    // the text selected in the book beside: highlighted there, not in the book read
    fireEvent.pointerDown(pane);
    act(() => {
      useSideStore.getState().setLocation({ cfi: 'epubcfi(/6/4!/4/2)', fraction: 0.1, tocLabel: 'Chapter One' });
      usePopups.getState().setSelection({
        text: 'down the rabbit hole', cfi: 'epubcfi(/6/4!/4/4,/1:0,/1:20)', index: 1,
        box: { left: 600, top: 10, right: 700, bottom: 20 },
      });
    });
    fireEvent.click(await screen.findByLabelText('Highlight'));
    expect(useSideStore.getState().notes[0]).toMatchObject({ text: 'down the rabbit hole', chapter: 'Chapter One' });
    expect(useReaderStore.getState().notes).toEqual([]);
    await act(async () => { await useSideStore.getState().flush(); });
    expect(await invoke<string>('read_file', { filePath: `${OTHER}.md` })).toContain('> down the rabbit hole');

    // the sidebar: of the book last used
    expect(screen.getByTestId('reader-sidebar-book')).toHaveTextContent('Other Book');
    fireEvent.click(screen.getByRole('tab', { name: /Notes/ }));
    expect(screen.getByTestId('reader-notes')).toHaveTextContent('down the rabbit hole');
    act(() => setActivePane('main'));
    expect(screen.getByTestId('reader-sidebar-book')).toHaveTextContent('Tiny Book');
    expect(screen.getByTestId('reader-notes')).not.toHaveTextContent('down the rabbit hole');

    // a bookmark in the book beside
    fireEvent.click(within(pane).getByLabelText('Bookmark this page of the book beside'));
    expect(useSideStore.getState().notes.map((n) => n.type)).toEqual(['annotation', 'bookmark']);
    expect(useReaderStore.getState().notes).toEqual([]);

    fireEvent.click(screen.getByLabelText('Close the book beside'));
    await waitFor(() => expect(screen.queryByTestId('parallel-pane')).not.toBeInTheDocument());
    // the sidebar: of the book read again
    expect(screen.getByTestId('reader-sidebar-book')).toHaveTextContent('Tiny Book');
  });

  test('closed with the book read', async () => {
    await writeBook(OTHER, makeEpub('Other Book'));
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    await act(() => useSideStore.getState().open(OTHER));
    expect(screen.getByTestId('parallel-pane')).toBeInTheDocument();
    await go({ view: 'library' });
    await waitFor(() => expect(useSideStore.getState().status).toBe('idle'));
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
    // no room for a book beside
    expect(screen.queryByTitle('Parallel reading')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Contents and notes'));
    expect(screen.getByTestId('reader-toc')).toBeInTheDocument();
    expect(store.getState().readerSettings.showSidebar).toBe(true);
  });
});

describe('library', () => {
  const bookItem = (title: string) => screen.findByRole('button', { name: title });
  const libraryEntry = async (title: string) =>
    Object.values((await readLibrary(WS)).books).find((b) => b.title === title);

  test('lists the books, opens one, syncs it or not', async () => {
    renderMain();
    await go({ view: 'library' });
    const card = await bookItem('Tiny Book');
    fireEvent.click(screen.getByTitle(/click to sync the book file too/));
    await waitFor(() => expect(screen.getByTitle(/click to stop/)).toBeInTheDocument());
    expect(await invoke<string>('read_file', { filePath: `${WS}/reading/.gitignore` })).toContain('!/Tiny Book.epub');

    fireEvent.click(card);
    await waitForView();
    expect(viewState()).toMatchObject({ view: 'book', bookPath: BOOK });
  });

  test('reads the metadata of the books never opened', async () => {
    await writeBook(`${WS}/reading/sub/file-name.epub`, makeEpub('Real Title'));
    renderMain();
    await go({ view: 'library' });
    expect(await bookItem('Real Title')).toBeInTheDocument();
    const lib = await readLibrary(WS);
    expect(Object.values(lib.books).map((b) => b.title).sort()).toEqual(['Real Title', 'Tiny Book']);
    expect(Object.values(lib.books).every((b) => b.metaRead && b.author === 'Jane Doe')).toBe(true);
  });

  test('adds books from the device', async () => {
    await writeBook('/downloads/Other.epub', makeEpub('Other'));
    vi.mocked(dialog.open).mockResolvedValueOnce(['/downloads/Other.epub']);
    renderMain();
    await go({ view: 'library' });
    await bookItem('Tiny Book');
    await act(async () => {
      fireEvent.click(screen.getByText('Add books'));
    });
    await waitForView();
    // one book added: read
    await waitFor(() => expect(viewState()).toMatchObject({ view: 'book', bookPath: `${WS}/reading/Other.epub` }));
    // opened, not writing to the library of the next test
    await waitFor(() => expect(useReaderStore.getState().status).toBe('ready'));
  });

  test('as a list, grouped by author, searched', async () => {
    await writeBook(`${WS}/reading/Second.epub`, makeEpub('Second'));
    // where the menus go
    const container = document.createElement('div');
    container.id = 'app-container';
    document.body.append(container);
    renderMain();
    await go({ view: 'library' });
    await bookItem('Second');
    await waitFor(() => expect(screen.getByLabelText('Search books')).toHaveAttribute('placeholder', 'Search in 2 books'));
    fireEvent.change(screen.getByLabelText('Search books'), { target: { value: '^sec' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiny Book' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Clear the search'));
    await bookItem('Tiny Book');

    await userEvent.click(screen.getByTestId('dropdown-button'));
    await userEvent.click(screen.getByText('List'));
    expect(store.getState().librarySettings.view).toBe('list');
    await userEvent.click(screen.getByTestId('dropdown-button'));
    await userEvent.click(screen.getByText('Authors'));
    expect(store.getState().librarySettings.groupBy).toBe('author');
    fireEvent.click(await bookItem('Jane Doe'));
    expect(await screen.findByText('Author:')).toBeInTheDocument();
    expect(await bookItem('Second')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Back to the library'));
    expect(await bookItem('Jane Doe')).toBeInTheDocument();
    container.remove();
  });

  test('a book put in a group, the group opened, renamed, ungrouped', async () => {
    renderMain();
    await go({ view: 'library' });
    fireEvent.click(await screen.findByLabelText('Book details'));
    fireEvent.click(await screen.findByLabelText('Group and status'));
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'Fiction / Short' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Doing' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    await waitFor(async () => expect(await libraryEntry('Tiny Book')).toMatchObject({ group: 'Fiction/Short', status: 'Doing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('book-details')).not.toBeInTheDocument());

    // the groups, nested
    fireEvent.click(await bookItem('Fiction'));
    fireEvent.click(await bookItem('Short'));
    expect(await bookItem('Tiny Book')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Groups' })).toHaveTextContent('AllFictionShort');

    fireEvent.click(screen.getByLabelText('Rename the group'));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Novels' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Rename'));
    });
    await waitFor(async () => expect((await libraryEntry('Tiny Book'))?.group).toBe('Novels'));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Groups' })).toHaveTextContent('AllNovels'));

    fireEvent.click(screen.getByLabelText('Rename the group'));
    await act(async () => {
      fireEvent.click(screen.getByText('Ungroup'));
    });
    await waitFor(async () => expect((await libraryEntry('Tiny Book'))?.group).toBeUndefined());
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Groups' })).not.toBeInTheDocument());
    expect(await bookItem('Tiny Book')).toBeInTheDocument();
  });

  test('the files of a group, of the books selected, synced', async () => {
    await writeBook(`${WS}/reading/Second.epub`, makeEpub('Second'));
    await writeBook(`${WS}/reading/Third.epub`, makeEpub('Third'));
    renderMain();
    await go({ view: 'library' });
    await bookItem('Third');
    const synced = async () => Object.fromEntries(Object.values((await readLibrary(WS)).books).map((b) => [b.title, Boolean(b.synced)]));

    // selected: a click on a book, not reading it
    fireEvent.click(screen.getByTitle('Select Books'));
    fireEvent.click(await bookItem('Tiny Book'));
    fireEvent.click(await bookItem('Second'));
    expect(viewState().view).toBe('library');
    const bar = screen.getByRole('toolbar', { name: 'Selected books' });
    expect(bar).toHaveTextContent('2 selected · 0 files synced');
    await act(async () => {
      fireEvent.click(within(bar).getByText('Sync files'));
    });
    await waitFor(async () => expect(await synced()).toEqual({ 'Tiny Book': true, Second: true, Third: false }));
    await waitFor(() => expect(bar).toHaveTextContent('2 selected · 2 files synced'));
    fireEvent.click(within(bar).getByText('Select all'));
    expect(bar).toHaveTextContent('3 selected');
    await act(async () => {
      fireEvent.click(within(bar).getByText('Stop syncing'));
    });
    await waitFor(async () => expect(await synced()).toEqual({ 'Tiny Book': false, Second: false, Third: false }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: 'Selected books' })).not.toBeInTheDocument();

    // a group: all its books at once
    const lib = await readLibrary(WS);
    await setBooksGroup(WS, Object.keys(lib.books).filter((h) => lib.books[h].title !== 'Third'), 'Mine');
    await go({ view: 'vocabulary' });
    await go({ view: 'library' });
    const group = await bookItem('Mine');
    fireEvent.click(within(group).getByTitle('0 of 2 book files synced: click to sync them all'));
    await waitFor(async () => expect(await synced()).toEqual({ 'Tiny Book': true, Second: true, Third: false }));
    fireEvent.click(await within(group).findByTitle(/All 2 book files synced/));
    await waitFor(async () => expect(await synced()).toEqual({ 'Tiny Book': false, Second: false, Third: false }));

    // the checkbox of a group selects its books; a click elsewhere opens it
    fireEvent.click(screen.getByTitle('Select Books'));
    fireEvent.click(screen.getByLabelText('Select Mine'));
    expect(screen.getByRole('toolbar', { name: 'Selected books' })).toHaveTextContent('2 selected');
    fireEvent.click(group);
    expect(await screen.findByRole('navigation', { name: 'Groups' })).toHaveTextContent('AllMine');
    expect(screen.getByLabelText('Select Tiny Book')).toBeChecked();
  });

  test('the books selected moved to a group, deleted', async () => {
    await writeBook(`${WS}/reading/Second.epub`, makeEpub('Second'));
    await writeBook(`${WS}/reading/Third.epub`, makeEpub('Third'));
    await invoke('write_file', { filePath: `${WS}/reading/Second.epub.md`, text: '# notes' });
    renderMain();
    await go({ view: 'library' });
    await bookItem('Third');
    fireEvent.click(screen.getByTitle('Select Books'));
    fireEvent.click(await bookItem('Tiny Book'));
    fireEvent.click(await bookItem('Second'));
    const bar = screen.getByRole('toolbar', { name: 'Selected books' });

    fireEvent.click(within(bar).getByText('Move to group'));
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'Shelf/Top ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    });
    await waitFor(async () => expect((await libraryEntry('Second'))?.group).toBe('Shelf/Top'));
    expect((await libraryEntry('Tiny Book'))?.group).toBe('Shelf/Top');
    expect((await libraryEntry('Third'))?.group).toBeUndefined();
    // in the group they went to, still selected
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Groups' })).toHaveTextContent('AllShelfTop'));
    expect(screen.getByLabelText('Select Second')).toBeChecked();

    fireEvent.click(within(bar).getByText('Delete'));
    expect(screen.getByText(/Delete the 2 books selected/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete 2 books' }));
    });
    await waitFor(async () => expect(Object.values((await readLibrary(WS)).books).map((b) => b.title)).toEqual(['Third']));
    expect(await invoke<boolean>('file_exist', { filePath: `${WS}/reading/Second.epub` })).toBe(false);
    // the notes kept unless asked
    expect(await invoke<boolean>('file_exist', { filePath: `${WS}/reading/Second.epub.md` })).toBe(true);
    await waitFor(() => expect(bar).toHaveTextContent('0 selected'));
    // the group gone: up to all the books
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Groups' })).not.toBeInTheDocument());
    expect(await bookItem('Third')).toBeInTheDocument();
  });

  test('books imported from a folder, grouped by their folders', async () => {
    await writeBook('/downloads/books/Sub/Other.epub', makeEpub('Other'));
    await writeBook('/downloads/books/Again.epub', makeEpub());
    vi.mocked(dialog.open).mockResolvedValueOnce('/downloads/books');
    renderMain();
    await go({ view: 'library' });
    await bookItem('Tiny Book');
    fireEvent.click(screen.getByTitle('Import the books of a folder and its sub folders'));
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Choose a folder'));
    });
    expect(await screen.findByText('/downloads/books')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Minimum file size (KB)'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    });
    // the same content as Tiny Book: not copied again
    expect(await screen.findByText('1 book added · 1 in the library already')).toBeInTheDocument();
    expect((await libraryEntry('Other'))?.group).toBe('books/Sub');
    expect((await libraryEntry('Tiny Book'))?.group).toBe('books');
    expect(await bookItem('books')).toBeInTheDocument();
    expect(store.getState().librarySettings.folderImport).toMatchObject({ dir: '/downloads/books', minSizeKB: 0, flatten: false });

    // the choices of the last time
    fireEvent.click(screen.getByTitle('Import the books of a folder and its sub folders'));
    expect(screen.getByText('/downloads/books')).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum file size (KB)')).toHaveValue(0);
  });

  test('the covers of a group in the list scrolled by arrows', async () => {
    await writeBook(`${WS}/reading/Second.epub`, makeEpub('Second'));
    await refreshLibrary(WS);
    await setBooksGroup(WS, Object.keys((await readLibrary(WS)).books), 'Mine');
    store.setState({ librarySettings: { ...DEFAULT_LIBRARY_SETTINGS, view: 'list' } });
    renderMain();
    await go({ view: 'library' });
    await bookItem('Mine');
    const row = screen.getByTestId('cover-row').firstElementChild as HTMLElement;
    expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    // wider than shown: jsdom lays nothing out
    Object.defineProperty(row, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(row, 'clientWidth', { value: 200, configurable: true });
    const scrollBy = vi.fn();
    row.scrollBy = scrollBy as unknown as typeof row.scrollBy;
    fireEvent.scroll(row);
    expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Scroll right'));
    expect(scrollBy).toHaveBeenCalledWith({ left: 100, behavior: 'smooth' });
    // not opening the group
    expect(screen.queryByRole('navigation', { name: 'Groups' })).not.toBeInTheDocument();
    row.scrollLeft = 400;
    fireEvent.scroll(row);
    expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
    expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
  });

  test('the metadata of a book edited, kept when the book is opened', async () => {
    renderMain();
    await go({ view: 'library' });
    fireEvent.click(await screen.findByLabelText('Book details'));
    expect((await within(await screen.findByTestId('book-details')).findAllByText('Jane Doe')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('Edit metadata'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    expect(screen.getByText('A title is needed')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Tiny Book' } });
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: 'Tiny' } });
    fireEvent.change(screen.getByLabelText('Series index'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Subjects'), { target: { value: 'Tests; Books' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    await waitFor(async () => expect(await libraryEntry('My Tiny Book')).toMatchObject({
      series: 'Tiny', seriesIndex: 2, subjects: ['Tests', 'Books'], edited: true,
    }));
    expect(await within(screen.getByTestId('book-details')).findByText('Tiny #2')).toBeInTheDocument();

    // not taken from the book file any more
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(useReaderStore.getState().status).toBe('ready'));
    expect(useReaderStore.getState().entry?.title).toBe('My Tiny Book');
    expect((await libraryEntry('My Tiny Book'))?.title).toBe('My Tiny Book');
  });

  test('a book deleted', async () => {
    await invoke('write_file', { filePath: `${BOOK}.md`, text: '# Tiny Book' });
    renderMain();
    await go({ view: 'library' });
    fireEvent.click(await screen.findByLabelText('Book details'));
    fireEvent.click(await screen.findByLabelText('Delete'));
    fireEvent.click(screen.getByLabelText(/Delete its notes too/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(await screen.findByText(/No books yet/)).toBeInTheDocument();
    expect(await invoke<boolean>('file_exist', { filePath: BOOK })).toBe(false);
    expect(await invoke<boolean>('file_exist', { filePath: `${BOOK}.md` })).toBe(false);
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
    expect(screen.queryByLabelText('Dictionary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Translate'));
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
    fireEvent.click(screen.getByLabelText('Dictionary'));
    expect(await screen.findByText('Could not look it up: offline')).toBeInTheDocument();
  });
});

describe('vocabulary', () => {
  const COLD = { en: [{ partOfSpeech: 'Adjective', language: 'English', definitions: [{ definition: 'Having a low temperature.' }] }] };

  test('a word looked up, added from the dictionary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => COLD })));
    renderMain();
    await go({ view: 'book', path: BOOK });
    await waitFor(() => expect(screen.getByTestId('foliate-viewer')).toBeInTheDocument());
    // the word in its paragraph, selected
    document.body.insertAdjacentHTML('beforeend', '<p id="page">It was a bright cold day in April. Then</p>');
    const range = document.createRange();
    range.setStart(document.getElementById('page')!.firstChild!, 16);
    range.setEnd(document.getElementById('page')!.firstChild!, 20);
    act(() => {
      usePopups.getState().setSelection({
        text: 'cold', cfi: 'epubcfi(/6/4!/4/4,/1:16,/1:20)', index: 1, range, box: { left: 10, top: 10, right: 50, bottom: 20 },
      });
    });
    fireEvent.click(screen.getByLabelText('Dictionary'));
    await act(async () => {
      fireEvent.click(await screen.findByText('Add to vocabulary'));
    });
    expect(await screen.findByTestId('word-kept')).toBeInTheDocument();
    const [entry] = useVocabulary.getState().entries;
    const hash = await invoke<string>('book_hash', { filePath: BOOK });
    expect(entry).toMatchObject({
      word: 'cold', language: 'English', source: 'wiktionary',
      definition: '<p><i>Adjective</i> Having a low temperature.</p>',
      context: { sentence: 'It was a bright cold day in April.', book: hash, title: 'Tiny Book', cfi: 'epubcfi(/6/4!/4/4,/1:16,/1:20)' },
    });
    document.getElementById('page')!.remove();
    vi.unstubAllGlobals();
  });

  test('the words studied by cards, seen all, deleted', async () => {
    const hash = await invoke<string>('book_hash', { filePath: BOOK });
    const add = useVocabulary.getState().add;
    await add(WS, { word: 'bright', definition: '<p>shining</p>' });
    await add(WS, {
      word: 'cold', definition: '<p><i>Adjective</i> chilly<img src=x onerror="alert(1)"></p>',
      context: { sentence: 'a bright cold day', book: hash, title: 'Tiny Book', cfi: 'epubcfi(/6/4!/4/2)' },
    });
    renderMain();
    await go({ view: 'library' });
    fireEvent.click(await screen.findByTitle('Vocabulary'));
    await waitForView();
    expect(viewState().view).toBe('vocabulary');
    expect(await screen.findByTestId('vocabulary-card')).toHaveTextContent('cold');
    expect(screen.getByTestId('vocabulary-position')).toHaveTextContent('1 / 2');
    // the definition sanitized
    expect(document.querySelector('[data-testid="vocabulary"] img[onerror]')).toBeNull();

    // a card gone through: reviewed
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    await waitFor(() => expect(screen.getByTestId('vocabulary-position')).toHaveTextContent('2 / 2'));
    await waitFor(() => expect(useVocabulary.getState().entries.find((e) => e.word === 'cold')?.reviewCount).toBe(1));

    // all of them; one deleted from the selection
    fireEvent.click(screen.getByLabelText('All the words'));
    expect(screen.getByText('Reviewed 1×')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select words to delete'));
    fireEvent.click(screen.getByLabelText('bright'));
    await act(async () => {
      fireEvent.click(screen.getByText('Delete 1'));
    });
    await waitFor(() => expect(useVocabulary.getState().entries.map((e) => e.word)).toEqual(['cold']));

    // back to the book where the word was met
    fireEvent.click(screen.getByLabelText('Study the cards'));
    await act(async () => {
      fireEvent.click(screen.getByText('Tiny Book'));
    });
    await waitFor(() => expect(viewState()).toMatchObject({ view: 'book', bookPath: BOOK, bookCfi: 'epubcfi(/6/4!/4/2)' }));
  });
});
