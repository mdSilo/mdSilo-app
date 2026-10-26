import { memo, useEffect, useRef } from 'react';
import { openUrl } from 'file/open';
import { store, useStore } from 'lib/store';
import { withDefaults, type ReaderSettings } from '../settings';
import { bookStyles, HIGHLIGHT_CSS, themeColors } from '../styles';
import { useReaderStore } from '../readerStore';
import { boxOfRange, usePopups } from '../popups';
import { setView, type FoliateView } from '../view';
import type { BookNote } from '../annotations';
import type { BookDoc } from '../document';
import { placeOf } from './BookPopups';

type Props = {
  book: BookDoc;
  initialCfi?: string;
};

type Overlayer = Record<'highlight' | 'underline' | 'squiggly', unknown>;

/** The annotation drawn for a note: the value is its CFI. */
export const toAnnotation = (note: BookNote) => ({ value: note.cfi, id: note.id });

const isFixedLayout = (book: BookDoc) => book.rendition?.layout === 'pre-paginated';

function applyLayout(view: FoliateView, settings: ReaderSettings) {
  const { renderer } = view;
  if (view.isFixedLayout) {
    renderer.setAttribute('flow', settings.flow === 'scrolled' ? 'scrolled' : 'paginated');
    return;
  }
  renderer.setAttribute('flow', settings.flow);
  renderer.setAttribute('max-column-count', String(settings.maxColumns));
  renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
  renderer.setAttribute('gap', `${settings.gap}%`);
  for (const side of ['top', 'bottom']) renderer.setAttribute(`margin-${side}`, '32px');
}

/**
 * The pages of a book, rendered by foliate-js. Reports where the reader is,
 * the text selected and the annotations clicked; draws the annotations.
 */
function FoliateViewer({ book, initialCfi }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const footnoteRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const footnote = usePopups((state) => state.footnote);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const darkMode = useStore((state) => state.darkMode);
  const theme = useStore((state) => state.theme);
  const notes = useReaderStore((state) => state.notes);
  const drawnRef = useRef(new Map<string, BookNote>());

  // open the book, once per book
  useEffect(() => {
    let cancelled = false;
    let overlayer: Overlayer | undefined;
    const container = containerRef.current;
    const footnoteHost = footnoteRef.current;
    if (!container) return;

    const onRelocate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.cfi) return;
      usePopups.getState().clear();
      useReaderStore.getState().setLocation({
        cfi: detail.cfi,
        fraction: detail.fraction ?? 0,
        tocLabel: detail.tocItem?.label,
        // the page of the printed book, if the book has a page list
        pageLabel: detail.pageItem?.label,
      });
    };

    const onDraw = (e: Event) => {
      const { draw, annotation } = (e as CustomEvent).detail;
      const note = drawnRef.current.get(annotation.value);
      if (!note || !overlayer) return;
      const color = HIGHLIGHT_CSS[note.color ?? 'yellow'] ?? HIGHLIGHT_CSS.yellow;
      const style = note.style ?? 'highlight';
      draw(overlayer[style] ?? overlayer.highlight, { color });
    };

    const onShow = (e: Event) => {
      const { value, range } = (e as CustomEvent).detail;
      const note = drawnRef.current.get(value);
      if (note && range) usePopups.getState().setAnnotation({ id: note.id, box: boxOfRange(range) });
    };

    // the annotations of a section, once it shows
    const onOverlay = (e: Event) => {
      const { index } = (e as CustomEvent).detail;
      for (const note of drawnRef.current.values()) {
        if (sectionOf(note.cfi) === index) void viewRef.current?.addAnnotation(toAnnotation(note));
      }
    };

    const onExternalLink = (e: Event) => {
      e.preventDefault();
      void openUrl((e as CustomEvent).detail.href);
    };

    // a link to a footnote: the note in a popup, not a jump away
    let footnotes: { handle: (book: BookDoc, e: Event) => Promise<void> | undefined } | undefined;
    let footnoteBox: ReturnType<typeof boxOfRange> | undefined;
    const onLink = (e: Event) => {
      if (!footnotes) return;
      const { a } = (e as CustomEvent).detail as { a: Element };
      footnoteBox = boxOfRange(a);
      footnotes.handle(book, e)?.catch((err: unknown) => console.warn('Failed to show the footnote', err));
    };

    const onLoad = (e: Event) => {
      const { doc, index } = (e as CustomEvent).detail as { doc: Document; index: number };
      const reportSelection = () => {
        setTimeout(() => {
          const sel = doc.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          const text = sel.toString().trim();
          const view = viewRef.current;
          if (!text || !view) return;
          usePopups.getState().setSelection({
            text, index, cfi: view.getCFI(index, range), box: boxOfRange(range), range,
          });
        }, 0);
      };
      doc.addEventListener('pointerup', reportSelection);
      // reading: for the time read, see readerStore
      doc.addEventListener('pointerdown', () => useReaderStore.getState().touch());
      doc.addEventListener('wheel', () => useReaderStore.getState().touch(), { passive: true });
      doc.addEventListener('keyup', (ev) => {
        if (ev.shiftKey) reportSelection();
      });
      doc.addEventListener('selectionchange', () => {
        if (doc.getSelection()?.isCollapsed && usePopups.getState().selection?.index === index) {
          usePopups.getState().setSelection(undefined);
        }
      });
      doc.addEventListener('keydown', onKeydown);
    };

    const onKeydown = (e: KeyboardEvent) => {
      useReaderStore.getState().touch();
      const view = viewRef.current;
      if (!view || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'h') void view.goLeft();
      else if (e.key === 'ArrowRight' || e.key === 'l') void view.goRight();
      else if (e.key === 'PageUp') void view.prev();
      else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) void view.next();
      else return;
      e.preventDefault();
    };

    (async () => {
      const [, { Overlayer }, { FootnoteHandler }] = await Promise.all([
        import('foliate-js/view.js'),
        import('foliate-js/overlayer.js'),
        import('foliate-js/footnotes.js'),
      ]);
      if (cancelled) return;
      overlayer = Overlayer as unknown as Overlayer;
      const handler = new FootnoteHandler();
      handler.addEventListener('before-render', (e: Event) => {
        const { view: note } = (e as CustomEvent).detail as { view: FoliateView };
        const host = footnoteRef.current;
        if (!host) return;
        // in place before it renders: an iframe moved later would reload
        note.style.display = 'block';
        note.style.width = '100%';
        note.style.height = '100%';
        host.replaceChildren(note);
        note.renderer.setAttribute('flow', 'scrolled');
        note.renderer.setAttribute('margin-top', '0px');
        note.renderer.setAttribute('margin-bottom', '0px');
        const settings = withDefaults(store.getState().readerSettings);
        // smaller, as notes are
        const noteSettings = { ...settings, fontSize: Math.round(settings.fontSize * 0.8), justify: false };
        note.renderer.setStyles?.(bookStyles(noteSettings, themeColors(store.getState().darkMode)));
        usePopups.getState().setFootnote({ box: footnoteBox ?? { left: 0, top: 0, right: 0, bottom: 0 } });
      });
      footnotes = handler as unknown as typeof footnotes;
      const view = document.createElement('foliate-view') as FoliateView;
      view.className = 'block w-full h-full';
      view.addEventListener('relocate', onRelocate);
      view.addEventListener('load', onLoad);
      view.addEventListener('draw-annotation', onDraw);
      view.addEventListener('show-annotation', onShow);
      view.addEventListener('create-overlay', onOverlay);
      view.addEventListener('external-link', onExternalLink);
      view.addEventListener('link', onLink);
      container.append(view);
      viewRef.current = view;
      await view.open(book);
      if (cancelled) return;
      const state = useReaderStore.getState();
      // the settings now, not of the render that opened the book
      const current = withDefaults(store.getState().readerSettings);
      applyLayout(view, current);
      view.renderer.setStyles?.(bookStyles(current, themeColors(store.getState().darkMode)));
      setView(view);
      // the notes to draw
      drawnRef.current = new Map(state.notes.filter((n) => n.text).map((n) => [n.cfi, n]));
      try {
        await view.init({ lastLocation: initialCfi, showTextStart: !initialCfi });
      } catch (e) {
        console.error('Failed to go to the place in the book', e);
        await view.init({ showTextStart: true });
      }
      // the arrow keys turn the pages
      if (!cancelled) container.focus({ preventScroll: true });
    })().catch((e) => console.error('Failed to show the book', e));

    container.addEventListener('keydown', onKeydown);
    return () => {
      cancelled = true;
      container.removeEventListener('keydown', onKeydown);
      const view = viewRef.current;
      viewRef.current = null;
      setView(null);
      usePopups.getState().clear();
      footnoteHost?.replaceChildren();
      if (view) {
        view.close();
        view.remove();
      }
    };
    // initialCfi: a new place is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  // go to a place asked later, e.g. a link to the book open
  useEffect(() => {
    const view = viewRef.current;
    if (view && initialCfi) void view.goTo(initialCfi);
  }, [initialCfi]);

  // the settings and theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    applyLayout(view, settings);
    view.renderer.setStyles?.(bookStyles(settings, themeColors(darkMode)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(settings), darkMode, theme]);

  // the annotations: drawn as they are added, changed or removed
  useEffect(() => {
    const view = viewRef.current;
    const drawn = drawnRef.current;
    const next = new Map(notes.filter((n) => n.text).map((n) => [n.cfi, n]));
    if (!view) {
      drawnRef.current = next;
      return;
    }
    for (const [cfi, note] of drawn) {
      const now = next.get(cfi);
      if (!now) void view.deleteAnnotation({ value: cfi });
      else if (now.color !== note.color || now.style !== note.style) drawn.delete(cfi);
    }
    drawnRef.current = next;
    for (const [cfi, note] of next) {
      if (!drawn.has(cfi)) void view.addAnnotation(toAnnotation(note)).catch(() => undefined);
    }
  }, [notes]);

  // the footnote shown, or its view closed
  useEffect(() => {
    const host = footnoteRef.current;
    if (footnote || !host) return;
    for (const child of Array.from(host.children)) {
      (child as HTMLElement & { close?: () => void }).close?.();
    }
    host.replaceChildren();
  }, [footnote]);

  const root = containerRef.current?.getBoundingClientRect();
  const place = footnote && root ? placeOf(footnote.box, root, 220, 380) : undefined;

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 focus:outline-none"
        tabIndex={-1}
        data-testid="foliate-viewer"
        style={{ ['--overlayer-highlight-opacity' as string]: darkMode ? '0.4' : '0.35' }}
      />
      <div
        ref={footnoteRef}
        className={`absolute z-30 h-52 p-2 border rounded-md shadow-lg bg-base-100 border-base-300 ${place ? '' : 'invisible'}`}
        style={place ? { left: place.left, top: place.top, width: 380 } : { left: 0, top: 0, width: 380 }}
        data-testid="footnote-popup"
        onPointerDown={(e) => e.stopPropagation()}
      />
    </>
  );
}

/** The section of a CFI, `epubcfi(/6/4!...)` is the second item (index 1). */
export function sectionOf(cfi: string): number {
  const match = cfi.match(/^epubcfi\(\/6\/(\d+)/);
  return match ? Number(match[1]) / 2 - 1 : -1;
}

export default memo(FoliateViewer);
