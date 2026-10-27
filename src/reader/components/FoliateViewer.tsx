import { memo, useEffect, useRef } from 'react';
import { openUrl } from 'file/open';
import { store, useStore } from 'lib/store';
import { withDefaults, type ReaderSettings } from '../settings';
import { bookStyles, HIGHLIGHT_CSS, themeColors } from '../styles';
import { useReaderStore } from '../readerStore';
import { boxOfRange, usePopups } from '../popups';
import { setView, type FoliateView } from '../view';
import { useReaderChrome } from '../chrome';
import { clickAction, keyAction, runKeyAction, turn, wheelGesture } from '../pagination';
import { sectionOf, type BookNote } from '../annotations';
import type { BookDoc } from '../document';
import { placeOf } from './BookPopups';

type Props = {
  book: BookDoc;
  initialCfi?: string;
};

type Overlayer = Record<'highlight' | 'underline' | 'squiggly', unknown>;

/** The annotation drawn for a note: the value is its CFI. */
export const toAnnotation = (note: BookNote) => ({ value: note.cfi, id: note.id });

/** ms between the clicks of a double click: a single click waits as long */
export const DOUBLE_CLICK_MS = 250;
/** ms: a press so long is not a click */
const LONG_PRESS_MS = 500;

function applyLayout(view: FoliateView, settings: ReaderSettings) {
  const { renderer } = view;
  renderer.toggleAttribute('animated', settings.animated);
  if (view.isFixedLayout) {
    renderer.setAttribute('flow', settings.flow === 'scrolled' ? 'scrolled' : 'paginated');
    return;
  }
  renderer.setAttribute('flow', settings.flow);
  renderer.setAttribute('max-column-count', String(settings.maxColumns));
  renderer.setAttribute('max-inline-size', `${settings.maxInlineSize}px`);
  renderer.setAttribute('gap', `${settings.gap}%`);
  // room for the chapter and the progress, in the margins; scrolled, the view is between them
  const margin = settings.flow === 'scrolled' ? 0 : settings.margin;
  for (const side of ['top', 'bottom']) renderer.setAttribute(`margin-${side}`, `${margin}px`);
}

/** px, the largest popup of a footnote: a longer note scrolls in it */
const NOTE_MAX = { width: 380, height: 320 };

/** After the layout of the changes made now: two frames. */
const afterLayout = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * The size of the popup of a footnote, to fit the note laid out in it:
 * as wide as its lines, as tall as its text, up to NOTE_MAX and the page.
 */
function noteSize(doc: Document, host: HTMLElement, note: HTMLElement) {
  const html = doc.documentElement;
  const style = getComputedStyle(html);
  // the lines of the note, its text and images: not the blocks around them
  let left = Infinity;
  let right = -Infinity;
  const range = doc.createRange();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE ? !node.textContent?.trim() : !(node as Element).matches('img, svg, video, table')) continue;
    range.selectNode(node);
    for (const rect of Array.from(range.getClientRects())) {
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
    }
  }
  const available = html.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const lines = right > left ? Math.min(right - left, available) : available;
  // the room around the note: the padding and border of the popup, the margins of the page
  const width = host.offsetWidth - available + lines;
  const height = host.offsetHeight - note.offsetHeight + html.getBoundingClientRect().height;
  const page = host.offsetParent?.getBoundingClientRect();
  return {
    width: Math.ceil(Math.min(width + 1, NOTE_MAX.width, (page?.width ?? Infinity) - 16)),
    height: Math.ceil(Math.min(height + 1, NOTE_MAX.height, (page?.height ?? Infinity) - 16)),
  };
}

/** Typing there: the keys are not for turning pages. */
const isEditable = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(el.isContentEditable || el.closest('input, textarea, select, [contenteditable="true"]'));
};

/** Not a click on the page: on a link, a note mark, a control. */
const isActive = (target: EventTarget | null) =>
  Boolean((target as Element | null)?.closest?.('a[href], sup, audio, video, button, input, select, textarea, label'));

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
      if (detail.reason !== 'selection') usePopups.getState().clear();
      const renderer = viewRef.current?.renderer;
      const paged = renderer && !viewRef.current?.isFixedLayout && !renderer.scrolled;
      useReaderStore.getState().setLocation({
        cfi: detail.cfi,
        fraction: detail.fraction ?? 0,
        tocLabel: detail.tocItem?.label,
        tocHref: detail.tocItem?.href,
        // the page of the printed book, if the book has a page list
        pageLabel: detail.pageItem?.label,
        section: detail.section,
        location: detail.location,
        time: detail.time,
        ...(paged ? { page: renderer.page, pages: renderer.pages } : {}),
      });
    };

    // a click on the page: on the sides turns it, in the middle shows the bars
    let lastClickAt = 0;
    let downAt = 0;
    let pressed = false;
    let popupAtDown = false;
    let annotationAt = 0;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const onPointerDown = () => {
      useReaderStore.getState().touch();
      downAt = Date.now();
      pressed = true;
      const popups = usePopups.getState();
      popupAtDown = Boolean(popups.selection || popups.annotation || popups.lookup || popups.footnote);
      if (popupAtDown) popups.clear();
    };
    const onPointerUp = () => {
      pressed = false;
    };
    const singleClick = (x: number, doc?: Document) => {
      // a selection made, an annotation shown, a popup closed: not a page turn
      const sel = doc?.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (Date.now() - annotationAt < DOUBLE_CLICK_MS * 2 || popupAtDown) return;
      const chrome = useReaderChrome.getState();
      const settings = withDefaults(store.getState().readerSettings);
      const box = container.getBoundingClientRect();
      const action = clickAction(x, box, { clickToTurn: settings.clickToTurn, swap: settings.swapClickArea });
      if (action === 'bars') {
        chrome.setBarsVisible(!chrome.barsVisible);
        return;
      }
      if (chrome.barsVisible && !chrome.menuOpen) {
        chrome.setBarsVisible(false);
        return;
      }
      void turn(viewRef.current, action);
    };
    const onClick = (e: MouseEvent, doc?: Document) => {
      const now = Date.now();
      if (clickTimer) clearTimeout(clickTimer);
      // the second click of a double click: a word selected
      if (now - lastClickAt < DOUBLE_CLICK_MS) {
        lastClickAt = now;
        return;
      }
      lastClickAt = now;
      if (e.button !== 0 || isActive(e.target) || pressed || now - downAt > LONG_PRESS_MS) return;
      // in the window, not in the frame of the section
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
      const x = e.clientX + (frame?.left ?? 0);
      clickTimer = setTimeout(() => singleClick(x, doc), DOUBLE_CLICK_MS);
    };

    // a gesture of the wheel turns a page, but in scrolled flow
    const onWheelGesture = wheelGesture();
    const onWheel = (e: WheelEvent) => {
      useReaderStore.getState().touch();
      const view = viewRef.current;
      if (!view || view.renderer.scrolled || e.ctrlKey) return;
      const side = onWheelGesture({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, timeStamp: e.timeStamp });
      if (side) void turn(view, side);
    };

    // the back and forward buttons of a mouse
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) viewRef.current?.history.back();
      else if (e.button === 4) viewRef.current?.history.forward();
      else return;
      e.preventDefault();
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
      if (!note || !range) return;
      annotationAt = Date.now();
      usePopups.getState().setAnnotation({ id: note.id, box: boxOfRange(range) });
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
      doc.addEventListener('pointerdown', onPointerDown);
      doc.addEventListener('pointerup', onPointerUp);
      doc.addEventListener('click', (ev) => onClick(ev, doc));
      doc.addEventListener('mouseup', onMouseUp);
      doc.addEventListener('wheel', onWheel, { passive: true });
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
      if (!view || e.defaultPrevented || isEditable(e.target)) return;
      if (e.key === 'Escape') {
        // the keys in a page of the book do not reach the window: the popups closed here too
        usePopups.getState().clear();
        useReaderChrome.getState().setBarsVisible(false);
        return;
      }
      // a button pressed by the keys
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as Element | null)?.closest?.('button, a[href]')) return;
      // the slider of the progress moves by the arrows
      if ((e.target as Element | null)?.closest?.('[role="slider"], input[type="range"]')) return;
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      void runKeyAction(view, action);
    };
    // the margins around the pages; the pages are in frames, their clicks do not come here
    const onContainerClick = (e: MouseEvent) => onClick(e);

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
        // the section of the note only: no sections around it, each with a note of the same id
        note.renderer.setAttribute('no-preload', '');
        note.renderer.setAttribute('no-continuous-scroll', '');
        // the popup has its padding: no margins of a page around the note
        for (const side of ['top', 'bottom', 'left', 'right']) note.renderer.setAttribute(`margin-${side}`, '0px');
        note.renderer.setAttribute('gap', '0%');
        const settings = withDefaults(store.getState().readerSettings);
        // smaller, as notes are
        const noteSettings = { ...settings, fontSize: Math.round(settings.fontSize * 0.8), justify: false };
        note.renderer.setStyles?.(bookStyles(noteSettings, themeColors(store.getState().darkMode, settings.pageTheme)));
      });
      // the note cut out of its section: the popup of its size, shown
      handler.addEventListener('render', (e: Event) => {
        const { view: note } = (e as CustomEvent).detail as { view: FoliateView };
        const box = footnoteBox ?? { left: 0, top: 0, right: 0, bottom: 0 };
        void afterLayout().then(() => {
          const host = footnoteRef.current;
          const doc = note.renderer.getContents()[0]?.doc;
          if (cancelled || !host || !doc || note.parentElement !== host) return;
          usePopups.getState().setFootnote({ box, size: noteSize(doc, host, note) });
        });
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
      view.renderer.setStyles?.(bookStyles(current, themeColors(store.getState().darkMode, current.pageTheme)));
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

    window.addEventListener('keydown', onKeydown);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('click', onContainerClick);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      cancelled = true;
      if (clickTimer) clearTimeout(clickTimer);
      window.removeEventListener('keydown', onKeydown);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('click', onContainerClick);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
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
    view.renderer.setStyles?.(bookStyles(settings, themeColors(darkMode, settings.pageTheme)));
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
  const place = footnote && root ? placeOf(footnote.box, root, footnote.size.height, footnote.size.width) : undefined;
  const paper = settings.pageTheme === 'auto' ? undefined : themeColors(darkMode, settings.pageTheme);
  const dark = paper ? paper.dark : darkMode;
  // the text would go under the chapter and the progress: the view is between them
  const inset = settings.flow === 'scrolled' || book.rendition?.layout === 'pre-paginated' ? settings.margin : 0;

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-x-0 focus:outline-none"
        tabIndex={-1}
        data-testid="foliate-viewer"
        style={{ top: inset, bottom: inset, ['--overlayer-highlight-opacity' as string]: dark ? '0.4' : '0.35' }}
      />
      <div
        ref={footnoteRef}
        className={`absolute z-30 px-3 py-2 border rounded-md shadow-lg bg-base-100 border-base-300 ${place ? '' : 'invisible'}`}
        style={{
          // not shown yet: the note laid out in the widest popup, to be measured
          ...(place && footnote ? { left: place.left, top: place.top, ...footnote.size } : { left: 0, top: 0, width: NOTE_MAX.width, height: NOTE_MAX.height }),
          ...(paper ? { background: paper.bg, color: paper.fg } : {}),
        }}
        data-testid="footnote-popup"
        onPointerDown={(e) => e.stopPropagation()}
      />
    </>
  );
}

export default memo(FoliateViewer);
