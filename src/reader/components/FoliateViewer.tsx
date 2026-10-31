import { memo, useEffect, useRef, useState } from 'react';
import { openUrl } from '@/workspace/open';
import { store, useStore } from '@/state/store';
import { DEFAULT_READER_SETTINGS, lookKey, withDefaults, zoomBy } from '../settings';
import {
  applyLayout, bookStyles, HIGHLIGHT_CSS, isVerticalMode, pageLayout, 
  pagesDirection, setBookDir, setSpread, themeColors,
} from '../styles';
import { storeOf } from '../readerStore';
import { boxOfRange, usePopups, type Box } from '../popups';
import { activePane, setActivePane, setView, type FoliateView, type Pane } from '../view';
import { useReaderChrome } from '../chrome';
import {
  clickAction, cornerAt, cornerTurner, DWELL_MS, keyAction, runKeyAction, turn, 
  wheelGesture, wheelPixels, wheelScrolls, zoomKey, type TurnHint,
} from '../pagination';
import { noteText, sectionOf, type BookNote } from '../annotations/annotations';
import { getDirection, type BookDoc } from '../document';
import { fillsPage, imagesOf, markCaptions, mediaAt, type Media } from '../media/media';
import { highlightCode } from '../highlight';
import { sentenceRangeAround } from '../vocabulary/vocabulary';
import { frameOf } from '../annotations/rangeEdit';
import { ImageViewer, TableViewer } from '../media/MediaViewer';
import RangeHandles from '../annotations/RangeHandles';
import { useBookTranslation } from '../translation/useBookTranslation';
import DoubleBorder from './DoubleBorder';
import { placeOf } from './BookPopups';

type Props = {
  book: BookDoc;
  initialCfi?: string;
  /** the book read, or the book beside it */
  pane?: Pane;
};

type Overlayer = Record<'highlight' | 'underline' | 'squiggly' | 'bubble', unknown>;

/** An image of the pages zoomed, among those of the chapter; or a table. */
type Zoomed =
  | { type: 'image'; images: Extract<Media, { type: 'image' }>[]; start: number }
  | { type: 'table'; html: string };

/** The place gone to, marked for a moment: its annotation, and the timer to remove it. */
export type Flash = { value: string; timer: ReturnType<typeof setTimeout> };
/** ms the place gone to stays marked */
const FLASH_MS = 2000;
/** the prefix of the mark: drawn apart from the notes, which have their bare CFI */
const FLASH_PREFIX = 'foliate-note:';
const FLASH_COLOR = HIGHLIGHT_CSS.blue;
/** the bubble on a highlight with a note: its CFI, as the marks apart from the notes */
const bubbleOf = (cfi: string) => FLASH_PREFIX + cfi;
const hasNote = (note: BookNote) => Boolean(noteText(note.note));
/** ms the note shown by the bubble hovered stays, the pointer gone: to get to it */
const HOVER_MS = 300;
/** px: the bubble, and the room around it to click */
const BUBBLE = { size: 16, padding: 2 };
type Rect = { left: number; top: number; right: number; bottom: number };

/** the highlight whose range a handle changes: drawn over the range dragged, apart from the notes */
type Preview = { value: string; note: BookNote };

/** The note of a bubble drawn, by its value; not the highlight dragged, nor a place marked. */
function noteOfBubble(value: string, drawn: Map<string, BookNote>, preview?: Preview) {
  if (!value.startsWith(FLASH_PREFIX) || value === preview?.value) return undefined;
  const note = drawn.get(value.slice(FLASH_PREFIX.length));
  return note && hasNote(note) ? note : undefined;
}

/** A highlight drawn, and the bubble on it if it has a note; or removed, both. */
function drawNote(view: FoliateView, note: BookNote, remove = false) {
  const draw = (value: string) => (remove ? view.deleteAnnotation({ value }) : view.addAnnotation({ value, id: note.id }));
  void draw(note.cfi).catch(() => undefined);
  if (remove || hasNote(note)) void draw(bubbleOf(note.cfi)).catch(() => undefined);
}

function clearFlash(view: FoliateView, flash: { current?: Flash; cleared?: (value: string) => void }) {
  if (!flash.current) return;
  const { value } = flash.current;
  clearTimeout(flash.current.timer);
  flash.current = undefined;
  void view.deleteAnnotation({ value }).then(() => flash.cleared?.(value)).catch(() => undefined);
}

/** Mark the sentence at a place gone to for a moment, to find it on the page. */
export async function flashPlace(view: FoliateView, cfi: string, flash: { current?: Flash; cleared?: (value: string) => void }) {
  const target = view.resolveNavigation(cfi);
  if (!target?.anchor) return;
  const doc = view.renderer.getContents().find((c) => c.index === target.index)?.doc;
  const range = doc ? target.anchor(doc) : null;
  // a range of text, not a place of a page
  if (!range || !('collapsed' in range) || range.collapsed) return;
  const value = FLASH_PREFIX + view.getCFI(target.index, sentenceRangeAround(range) ?? range);
  clearFlash(view, flash);
  flash.current = { value, timer: setTimeout(() => clearFlash(view, flash), FLASH_MS) };
  await view.addAnnotation({ value });
}

/** ms between the clicks of a double click: a single click waits as long */
export const DOUBLE_CLICK_MS = 250;
/** ms: a press so long is not a click */
const LONG_PRESS_MS = 500;

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

/**
 * The text of the pages, in the window: the pages of the renderer, less the
 * margins of the chapter and the progress, above and below them (or on the
 * sides, written down the page).
 */
function readingArea(view: FoliateView | null, vertical = false): Box | undefined {
  if (!view) return undefined;
  const rect = (view.renderer.shadowRoot?.querySelector('#container') ?? view).getBoundingClientRect();
  const { margins } = pageLayout(withDefaults(store.getState().readerSettings), vertical);
  return vertical
    ? { left: rect.left + margins.left, top: rect.top, right: rect.right - margins.right, bottom: rect.bottom }
    : { left: rect.left, top: rect.top + margins.top, right: rect.right, bottom: rect.bottom - margins.bottom };
}

/** A box in a page of the book, in the window. */
function windowBox(doc: Document | undefined, rect: Box): Box {
  const { left, top, scale } = frameOf(doc);
  return { left: left + rect.left * scale, top: top + rect.top * scale, right: left + rect.right * scale, bottom: top + rect.bottom * scale };
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

/** The zoom of a fixed layout, set: of all such books, as the other settings. */
function setZoom(level: (now: number) => number) {
  const settings = withDefaults(store.getState().readerSettings);
  const zoomLevel = level(settings.zoomLevel);
  if (zoomLevel !== settings.zoomLevel) store.getState().setReaderSettings({ ...settings, zoomLevel });
}

/**
 * The pages of a book, rendered by foliate-js. Reports where the reader is,
 * the text selected and the annotations clicked; draws the annotations.
 */
function FoliateViewer({ book, initialCfi, pane = 'main' }: Props) {
  const bookStore = storeOf(pane);
  const containerRef = useRef<HTMLDivElement>(null);
  const footnoteRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const footnote = usePopups((state) => state.footnote);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const darkMode = useStore((state) => state.darkMode);
  const theme = useStore((state) => state.theme);
  const notes = bookStore((state) => state.notes);
  const fixed = book.rendition?.layout === 'pre-paginated';
  // a fixed layout: its pages from right to left or from left to right, as chosen; 
  // no text to write otherwise
  const writingMode = bookStore((state) => (
    fixed ? pagesDirection(state.writingMode) : state.writingMode
  ));
  const textMode = fixed ? 'auto' : writingMode;
  const vertical = bookStore((state) => state.vertical);
  const drawnRef = useRef(new Map<string, BookNote>());
  const flashRef = useRef<Flash | undefined>(undefined) as { current?: Flash; cleared?: (value: string) => void };
  const previewRef = useRef<Preview | undefined>(undefined);
  // a bubble at the place marked: drawn again, the mark gone
  flashRef.cleared = (value) => {
    if (viewRef.current && noteOfBubble(value, drawnRef.current, previewRef.current)) {
      void viewRef.current.addAnnotation({ value }).catch(() => undefined);
    }
  };
  const [turnHint, setTurnHint] = useState<TurnHint>();
  const [zoomed, setZoomed] = useState<Zoomed>();
  // the view opened, for what goes with it
  const [opened, setOpened] = useState<FoliateView | null>(null);
  useBookTranslation(opened, pane);

  // open the book, once per book; again in another writing
  useEffect(() => {
    let cancelled = false;
    let overlayer: Overlayer | undefined;
    const container = containerRef.current;
    const footnoteHost = footnoteRef.current;
    if (!container) return;

    const onRelocate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.cfi) return;
      // a page turned by a handle dragged to a corner: the range goes on
      if (detail.reason !== 'selection' && !usePopups.getState().adjusting) usePopups.getState().clear();
      const renderer = viewRef.current?.renderer;
      const paged = renderer && !viewRef.current?.isFixedLayout && !renderer.scrolled;
      bookStore.getState().setLocation({
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
      bookStore.getState().touch();
      setActivePane(pane);
      downAt = Date.now();
      pressed = true;
      const popups = usePopups.getState();
      popupAtDown = Boolean(popups.selection || popups.annotation || popups.lookup || popups.footnote);
      if (popupAtDown) popups.clear();
    };
    const onPointerUp = () => {
      pressed = false;
      turner.cancel();
    };

    // a selection dragged to a corner of the page turns it, and goes on in the next one
    const turner = cornerTurner(
      (corner) => (corner === 'end' ? viewRef.current?.next() : viewRef.current?.prev()),
      setTurnHint,
    );
    const onSelectDrag = (e: PointerEvent, doc: Document) => {
      const view = viewRef.current;
      const area = readingArea(view, bookStore.getState().vertical);
      // the pages of a chapter only: in scrolled flow the selection scrolls them
      const selecting = (e.buttons & 1) === 1 && doc.getSelection()?.isCollapsed === false;
      if (!view || !area || view.isFixedLayout || view.renderer.scrolled || !selecting) {
        turner.cancel();
        return;
      }
      // in the window, not in the frame of the section
      const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
      const point = { x: e.clientX + (frame?.left ?? 0), y: e.clientY + (frame?.top ?? 0) };
      turner.note(cornerAt(point, area, view.book?.dir === 'rtl'));
    };
    const singleClick = (x: number, doc?: Document, media?: Media | null, filling = false) => {
      // a selection made, an annotation shown, a popup closed: not a page turn
      const sel = doc?.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (Date.now() - annotationAt < DOUBLE_CLICK_MS * 2 || popupAtDown) return;
      const chrome = useReaderChrome.getState();
      const settings = withDefaults(store.getState().readerSettings);
      const box = container.getBoundingClientRect();
      const action = clickAction(x, box, { clickToTurn: settings.clickToTurn, swap: settings.swapClickArea });
      // an image or a table: zoomed, alone over the pages; one filling the
      // page turns it on the sides, as the text, and zooms in the middle
      if (filling && action !== 'bars') media = null;
      if (media?.type === 'table') {
        setZoomed({ type: 'table', html: media.html });
        return;
      }
      if (media?.type === 'image') {
        const images = imagesOf(viewRef.current?.renderer.getContents() ?? []);
        const start = images.findIndex((image) => image.src === media.src);
        setZoomed(start < 0 ? { type: 'image', images: [media], start: 0 } : { type: 'image', images, start });
        return;
      }
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
      // in a reflowable book
      const media = doc && !viewRef.current?.isFixedLayout ? mediaAt(e.target) : null;
      if (e.button !== 0 || (!media && isActive(e.target)) || pressed || now - downAt > LONG_PRESS_MS) return;
      // in the window, not in the frame of the section
      const frame = doc?.defaultView?.frameElement?.getBoundingClientRect();
      const x = e.clientX + (frame?.left ?? 0);
      const filling = Boolean(media) && fillsPage(e.target);
      clickTimer = setTimeout(() => singleClick(x, doc, media, filling), DOUBLE_CLICK_MS);
    };

    // a gesture of the wheel turns a page, but in scrolled flow
    const onWheelGesture = wheelGesture();
    const onWheel = (e: WheelEvent) => {
      bookStore.getState().touch();
      const view = viewRef.current;
      if (!view) return;
      if (view.renderer.scrolled) {
        // written down the page it scrolls across, the wheel not: forward to the left
        const container = view.renderer.shadowRoot?.querySelector('#container');
        if (container?.classList.contains('vertical') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          container.scrollLeft -= wheelPixels(e.deltaY, e.deltaMode, container.clientWidth);
        }
        return;
      }
      if (e.ctrlKey) {
        // a fixed layout zooms, by the wheel or a pinch of a touchpad; not the window
        if (!view.isFixedLayout || !e.deltaY) return;
        e.preventDefault();
        setZoom((now) => zoomBy(now, -e.deltaY / 100));
        return;
      }
      // a page larger than the view scrolls, as the wheel does it; turned at its edge
      const scrolls = view.isFixedLayout && wheelScrolls(view.renderer, e.deltaX, e.deltaY);
      const side = onWheelGesture({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, timeStamp: e.timeStamp }, scrolls);
      if (side) void turn(view, side);
    };
    // not passive in a fixed layout, to zoom it alone by Ctrl and the wheel
    const wheelOptions = { passive: book.rendition?.layout !== 'pre-paginated' };

    // the back and forward buttons of a mouse
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) viewRef.current?.history.back();
      else if (e.button === 4) viewRef.current?.history.forward();
      else return;
      e.preventDefault();
    };

    const onDraw = (e: Event) => {
      const { draw, annotation, doc, range } = (e as CustomEvent).detail;
      if (overlayer && annotation.value === flashRef.current?.value) {
        draw(overlayer.highlight, { color: FLASH_COLOR });
        return;
      }
      const preview = previewRef.current;
      if (
        overlayer && 
        preview?.value !== annotation.value && 
        annotation.value.startsWith(FLASH_PREFIX)
      ) {
        const note = drawnRef.current.get(annotation.value.slice(FLASH_PREFIX.length));
        if (!note || !hasNote(note)) return;
        const start = range.startContainer.nodeType === Node.ELEMENT_NODE 
          ? range.startContainer 
          : range.startContainer.parentElement;
        const { writingMode } = doc.defaultView.getComputedStyle(start);
        // small, above the end of the first line: a click on the text is on the highlight
        draw(writingMode.startsWith('vertical') ? besideColumn : overlayer.bubble, 
          { 
            writingMode, 
            color: HIGHLIGHT_CSS[note.color ?? 'yellow'], 
            ...BUBBLE 
          }
        );
        return;
      }
      const note = preview && preview.value === annotation.value ? preview.note : drawnRef.current.get(annotation.value);
      if (!note || !overlayer) return;
      const color = HIGHLIGHT_CSS[note.color ?? 'yellow'] ?? HIGHLIGHT_CSS.yellow;
      const style = note.style ?? 'highlight';
      draw(overlayer[style] ?? overlayer.highlight, { color });
    };

    // written down the page, above the line is on the right of it: the bubble there, at the end
    // of the first column, not on its text (foliate-js puts it over the corner); its box, so
    // moved, is where it is clicked
    const besideColumn = (rects: Rect[], options: object) => {
      if (rects[0]) rects[0].right += BUBBLE.size - BUBBLE.padding;
      return (overlayer?.bubble as (rects: Rect[], options: object) => unknown)(rects, options);
    };

    const onShow = (e: Event) => {
      const { value, range, rect, index } = (e as CustomEvent).detail;
      const bubbled = noteOfBubble(value, drawnRef.current, previewRef.current);
      if (bubbled) {
        annotationAt = Date.now();
        const doc = viewRef.current?.renderer.getContents().find((c) => c.index === index)?.doc;
        if (rect) usePopups.getState().setAnnotation({ id: bubbled.id, box: windowBox(doc, rect), bubble: true });
        return;
      }
      const note = drawnRef.current.get(value);
      if (!note || !range) return;
      annotationAt = Date.now();
      usePopups.getState().setAnnotation({ id: note.id, box: boxOfRange(range, readingArea(viewRef.current, bookStore.getState().vertical)), range });
    };

    // the annotations of a section, once it shows
    const onOverlay = (e: Event) => {
      const { index } = (e as CustomEvent).detail;
      const view = viewRef.current;
      for (const note of drawnRef.current.values()) {
        if (view && sectionOf(note.cfi) === index) drawNote(view, note);
      }
    };

    // the bubble of a note hovered: the note shown, as long as the pointer is on it or on the note
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    const onHover = (e: MouseEvent, doc: Document) => {
      if (e.buttons) return;
      const overlay = viewRef.current?.renderer.getContents().find((c) => c.doc === doc)?.overlayer;
      const [value, , rect] = overlay?.hitTest({ x: e.clientX, y: e.clientY }) ?? [];
      const note = value ? noteOfBubble(value, drawnRef.current, previewRef.current) : undefined;
      const popups = usePopups.getState();
      if (note && rect) {
        clearTimeout(hoverTimer);
        hoverTimer = undefined;
        // not over another popup, nor the note shown already
        const shown = popups.selection || popups.lookup || popups.footnote || popups.annotation;
        if (!shown || (popups.annotation?.hover && popups.annotation.id !== note.id)) {
          popups.setAnnotation({ id: note.id, box: windowBox(doc, rect), bubble: true, hover: 'bubble' });
        }
        return;
      }
      if (popups.annotation?.hover !== 'bubble' || hoverTimer) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        if (usePopups.getState().annotation?.hover === 'bubble') usePopups.getState().clear();
      }, HOVER_MS);
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
          setActivePane(pane);
          usePopups.getState().setSelection({
            text, index, cfi: view.getCFI(index, range), box: boxOfRange(range, readingArea(view, bookStore.getState().vertical)), range,
          });
        }, 0);
      };
      doc.addEventListener('pointerup', reportSelection);
      // reading: for the time read, see readerStore
      doc.addEventListener('pointerdown', onPointerDown);
      doc.addEventListener('pointerup', onPointerUp);
      doc.addEventListener('pointermove', (ev) => onSelectDrag(ev, doc));
      doc.addEventListener('mousemove', (ev) => onHover(ev, doc));
      doc.addEventListener('click', (ev) => onClick(ev, doc));
      // an image in a link zooms: the link not followed by foliate-js, whose listener comes first
      doc.addEventListener('click', (ev) => {
        if (viewRef.current?.isFixedLayout || !(ev.target as Element | null)?.closest?.('a[href]') || !mediaAt(ev.target)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        onClick(ev, doc);
      }, true);
      doc.addEventListener('mouseup', onMouseUp);
      doc.addEventListener('wheel', onWheel, wheelOptions);
      doc.addEventListener('keyup', (ev) => {
        if (ev.shiftKey) reportSelection();
      });
      doc.addEventListener('selectionchange', () => {
        if (doc.getSelection()?.isCollapsed && usePopups.getState().selection?.index === index) {
          usePopups.getState().setSelection(undefined);
        }
      });
      doc.addEventListener('keydown', onKeydown);
      // the text written down the page, as a section of the book says: the margins of it
      const view = viewRef.current;
      if (view && !fixed && !bookStore.getState().vertical && getDirection(doc).vertical) {
        bookStore.getState().setVertical(true);
        applyLayout(view, withDefaults(store.getState().readerSettings), true);
      }
      // the captions, shown or not by the styles: a setting changed needs no pass here
      if (!viewRef.current?.isFixedLayout) markCaptions(doc);
      const { codeHighlight, codeLanguage } = withDefaults(store.getState().readerSettings);
      if (codeHighlight) highlightCode(doc, true, codeLanguage);
    };

    const onKeydown = (e: KeyboardEvent) => {
      bookStore.getState().touch();
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
      const zoom = view.isFixedLayout ? zoomKey(e) : undefined;
      if (zoom !== undefined) {
        e.preventDefault();
        setZoom((now) => (zoom === 'reset' ? DEFAULT_READER_SETTINGS.zoomLevel : zoomBy(now, zoom)));
        return;
      }
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      void runKeyAction(view, action);
    };
    // the keys of the window: for the book last used, of the two read side by side
    const onWindowKeydown = (e: KeyboardEvent) => {
      if (activePane() === pane) onKeydown(e);
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
      // the direction first: the side of the cover goes by it
      setBookDir(book, writingMode);
      setSpread(book, withDefaults(store.getState().readerSettings));
      bookStore.getState().setVertical(isVerticalMode(writingMode));
      await view.open(book);
      if (cancelled) return;
      const state = bookStore.getState();
      // the settings now, not of the render that opened the book
      const current = withDefaults(store.getState().readerSettings);
      applyLayout(view, current, state.vertical);
      view.renderer.setStyles?.(bookStyles(current, themeColors(store.getState().darkMode, current.pageTheme), textMode));
      setView(view, pane);
      setOpened(view);
      // the notes to draw
      drawnRef.current = new Map(state.notes.filter((n) => n.text).map((n) => [n.cfi, n]));
      // opened again in another writing: where the reader is
      const reopened = state.location?.cfi;
      const start = reopened ?? initialCfi;
      try {
        await view.init({ lastLocation: start, showTextStart: !start });
        // a place asked for, not the place read last
        if (!cancelled && !reopened && initialCfi && bookStore.getState().targetCfi === initialCfi) {
          void flashPlace(view, initialCfi, flashRef).catch(() => undefined);
        }
      } catch (e) {
        console.error('Failed to go to the place in the book', e);
        await view.init({ showTextStart: true });
      }
      // the arrow keys turn the pages
      if (!cancelled) container.focus({ preventScroll: true });
    })().catch((e) => console.error('Failed to show the book', e));

    window.addEventListener('keydown', onWindowKeydown);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('click', onContainerClick);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, wheelOptions);
    return () => {
      cancelled = true;
      if (clickTimer) clearTimeout(clickTimer);
      turner.cancel();
      window.removeEventListener('keydown', onWindowKeydown);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('click', onContainerClick);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      const view = viewRef.current;
      viewRef.current = null;
      if (flashRef.current) clearTimeout(flashRef.current.timer);
      flashRef.current = undefined;
      setView(null, pane);
      setOpened(null);
      usePopups.getState().clear();
      footnoteHost?.replaceChildren();
      if (view) {
        view.close();
        view.remove();
      }
    };
    // initialCfi: a new place is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, writingMode]);

  // go to a place asked later, e.g. a link to the book open
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !initialCfi) return;
    void view.goTo(initialCfi).then(() => {
      if (viewRef.current === view && bookStore.getState().targetCfi === initialCfi) {
        return flashPlace(view, initialCfi, flashRef);
      }
    }).catch(() => undefined);
  }, [initialCfi, bookStore]);

  // the settings and theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    applyLayout(view, settings, vertical);
    view.renderer.setStyles?.(bookStyles(settings, themeColors(darkMode, settings.pageTheme), textMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey(settings), darkMode, theme, vertical]);

  // the code blocks of the sections shown; the sections loaded later, on load
  useEffect(() => {
    for (const { doc } of viewRef.current?.renderer?.getContents() ?? []) {
      highlightCode(doc, settings.codeHighlight, settings.codeLanguage);
    }
  }, [settings.codeHighlight, settings.codeLanguage]);

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
      if (!now) drawNote(view, note, true);
      else if (now.color !== note.color || now.style !== note.style) drawn.delete(cfi);
      // its note written, or gone: the bubble
      else if (hasNote(now) !== hasNote(note)) {
        if (hasNote(note)) void view.deleteAnnotation({ value: bubbleOf(cfi) }).catch(() => undefined);
        else void view.addAnnotation({ value: bubbleOf(cfi) }).catch(() => undefined);
      }
    }
    drawnRef.current = next;
    for (const [cfi, note] of next) {
      if (!drawn.has(cfi)) drawNote(view, note);
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

  // a highlight drawn over the range dragged, in place of it; or as saved, the drag over
  const preview = (note: BookNote, range?: Range) => {
    const view = viewRef.current;
    if (!view) return;
    if (previewRef.current) void view.deleteAnnotation({ value: previewRef.current.value }).catch(() => undefined);
    previewRef.current = undefined;
    if (!range) {
      // still there, not changed
      const kept = bookStore.getState().notes.find((n) => n.cfi === note.cfi);
      if (kept) drawNote(view, kept);
      return;
    }
    drawNote(view, note, true);
    const index = sectionOf(note.cfi);
    previewRef.current = { value: FLASH_PREFIX + view.getCFI(index, range), note };
    void view.addAnnotation({ value: previewRef.current.value }).catch(() => undefined);
  };

  // the keys back to the pages
  const closeZoomed = () => {
    setZoomed(undefined);
    containerRef.current?.focus({ preventScroll: true });
  };

  const root = containerRef.current?.getBoundingClientRect();
  const place = footnote && root ? placeOf(footnote.box, root, footnote.size.height, footnote.size.width) : undefined;
  const paper = settings.pageTheme === 'auto' ? undefined : themeColors(darkMode, settings.pageTheme);
  const dark = paper ? paper.dark : darkMode;
  // the text would go under the chapter and the progress: the view is between them
  const { inset } = pageLayout(settings, vertical, fixed);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute focus:outline-none"
        tabIndex={-1}
        data-testid="foliate-viewer"
        style={{ ...inset, ['--overlayer-highlight-opacity' as string]: dark ? '0.4' : '0.35' }}
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
      {vertical && settings.doubleBorder && !fixed ? (
        <DoubleBorder header={settings.showHeader} footer={settings.showFooter} />
      ) : null}
      {zoomed?.type === 'image' ? <ImageViewer images={zoomed.images} start={zoomed.start} onClose={closeZoomed} /> : null}
      {zoomed?.type === 'table' ? (
        <TableViewer html={zoomed.html} colors={themeColors(darkMode, settings.pageTheme)} onClose={closeZoomed} />
      ) : null}
      <RangeHandles
        pane={pane}
        view={() => viewRef.current}
        area={() => readingArea(viewRef.current, vertical)}
        vertical={vertical}
        onTurnHint={setTurnHint}
        preview={preview}
      />
      {turnHint ? <TurnMark key={turnHint.corner} hint={turnHint} area={readingArea(viewRef.current, vertical)} rtl={book.dir === 'rtl'} /> : null}
    </>
  );
}

/**
 * The edge of the page a selection dragged will turn, as readup marks it: a
 * bar along it runs the length of the wait, to keep holding there.
 */
function TurnMark({ hint, area, rtl }: { hint: TurnHint; area?: Box; rtl: boolean }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!area) return null;
  const end = hint.corner === 'end';
  // the end of a page written right to left is at its bottom left
  const right = end !== rtl;
  const bar = (horizontal: boolean) => ({
    opacity: hint.turned ? 0.75 : 0.35,
    transform: `scale${horizontal ? 'X' : 'Y'}(${grown || hint.turned ? 1 : 0})`,
    transformOrigin: horizontal ? (right ? 'right' : 'left') : (end ? 'bottom' : 'top'),
    transition: `transform ${hint.turned ? 120 : DWELL_MS}ms linear`,
  });
  return (
    <div
      className="fixed z-40 pointer-events-none"
      style={{ left: area.left, top: area.top, width: area.right - area.left, height: area.bottom - area.top }}
      data-testid="turn-mark"
      aria-hidden
    >
      <div className={`absolute inset-y-0 w-[3px] rounded-full bg-base-content ${right ? 'right-0' : 'left-0'}`} style={bar(false)} />
      <div className={`absolute inset-x-0 h-[3px] rounded-full bg-base-content ${end ? 'bottom-0' : 'top-0'}`} style={bar(true)} />
    </div>
  );
}

export default memo(FoliateViewer);
