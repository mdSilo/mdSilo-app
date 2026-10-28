import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TbChevronLeft, TbChevronRight, TbMaximize, TbMinus, TbPlus, TbX } from 'react-icons/tb';
import { sanitizeHtml } from '@/utils/sanitize';
import type { Media } from '../media';

/**
 * An image or a table of the book, alone over the pages, to zoom and pan
 * (ported from readup: ImageViewer, TableViewer, ZoomControls).
 */

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.2;
const WHEEL_SENSITIVITY = 0.002;
/** ms the zoom level shows after a change */
const LABEL_MS = 2000;

type Point = { x: number; y: number };

const clamp = (scale: number) => Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);

/** The offset that keeps the point under the pointer in place as the scale changes. */
export const zoomedOffset = (anchor: Point, from: number, to: number, pos: Point): Point => ({
  x: anchor.x - (anchor.x - pos.x) * (to / from),
  y: anchor.y - (anchor.y - pos.y) * (to / from),
});

/** Zoom by the buttons, the keys, the wheel with Ctrl and a pinch; pan by a drag once zoomed in. */
function useZoom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScaleState] = useState(1);
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [labelShown, setLabelShown] = useState(true);
  const labelTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const dragged = useRef(false);
  const pinch = useRef(0);

  const showLabel = () => {
    clearTimeout(labelTimer.current);
    setLabelShown(true);
    labelTimer.current = setTimeout(() => setLabelShown(false), LABEL_MS);
  };
  useEffect(() => {
    showLabel();
    return () => clearTimeout(labelTimer.current);
  }, []);

  /** To a scale, about a point of the container (its center by default). */
  const zoomTo = (next: number, anchor?: Point) => {
    const to = clamp(next);
    if (to <= 1) setPos({ x: 0, y: 0 });
    else if (anchor) setPos((p) => zoomedOffset(anchor, scale, to, p));
    setScaleState(to);
    showLabel();
  };
  const reset = () => zoomTo(1);
  /** A point of the window, from the center of the container. */
  const anchorOf = (clientX: number, clientY: number): Point | undefined => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : undefined;
  };

  // the wheel with Ctrl (and a pinch of a trackpad) zooms; not passive, to keep the page from zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), anchorOf(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // a drag followed on the window, also when the pointer leaves what moves
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      dragged.current = true;
      setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragged.current = false;
    if (scale <= 1 || e.button !== 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
  };

  const touchProps = {
    onTouchStart: (e: React.TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      if (a && b) pinch.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      else if (a && scale > 1) dragStart.current = { x: a.clientX - pos.x, y: a.clientY - pos.y };
      dragged.current = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      dragged.current = true;
      if (a && b && pinch.current) {
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        zoomTo(scale * (distance / pinch.current), anchorOf((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2));
        pinch.current = distance;
      } else if (a && scale > 1) {
        setPos({ x: a.clientX - dragStart.current.x, y: a.clientY - dragStart.current.y });
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const a = e.touches[0];
      if (e.touches.length < 2) pinch.current = 0;
      // the finger left on the screen goes on panning from where it is
      if (a) dragStart.current = { x: a.clientX - pos.x, y: a.clientY - pos.y };
    },
  };

  /** The keys: Ctrl with +, - and 0 zoom. */
  const onZoomKey = (e: React.KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) return false;
    if (e.key === '=' || e.key === '+') zoomTo(scale * ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') zoomTo(scale / ZOOM_STEP);
    else if (e.key === '0') reset();
    else return false;
    e.preventDefault();
    return true;
  };

  const style: React.CSSProperties = {
    transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
    // no lag behind the pointer while dragging or pinching
    transition: dragging || pinch.current ? 'none' : 'transform 0.05s ease-out',
    willChange: 'transform',
    cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
    touchAction: 'none',
  };

  return {
    scale, labelShown, style, dragged, touchProps, onPointerDown, onZoomKey, zoomTo, reset, anchorOf, showLabel,
    zoomIn: () => zoomTo(scale * ZOOM_STEP),
    zoomOut: () => zoomTo(scale / ZOOM_STEP),
  };
}

const ROUND = 'flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70';

type Zoom = ReturnType<typeof useZoom>;

/**
 * Over the pages, focused: Escape closes; a click beside the content closes,
 * not after a drag. The keys stop here: they do not turn the pages under it.
 */
function Overlay(
  { label, zoom, containerRef, onClose, onKey, children, extra }: {
    label: string;
    zoom: Zoom;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onKey?: (e: React.KeyboardEvent) => boolean;
    children: ReactNode;
    extra?: ReactNode;
  },
) {
  useEffect(() => containerRef.current?.focus(), [containerRef]);
  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden outline-none select-none bg-black/60 backdrop-blur-sm"
      data-testid="media-viewer"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else if (!zoom.onZoomKey(e)) onKey?.(e);
      }}
      onClick={() => {
        if (zoom.dragged.current) zoom.dragged.current = false;
        else onClose();
      }}
      {...zoom.touchProps}
    >
      {children}
      <div className="absolute z-10 grid gap-3 right-4 top-4" onClick={(e) => e.stopPropagation()}>
        <button className={`${ROUND} w-9 h-9`} onClick={onClose} aria-label="Close" title="Close (Esc)">
          <TbX size={20} />
        </button>
        <button className={`${ROUND} w-9 h-9`} onClick={zoom.zoomIn} aria-label="Zoom in" title="Zoom in (Ctrl +)">
          <TbPlus size={20} />
        </button>
        <button className={`${ROUND} w-9 h-9`} onClick={zoom.zoomOut} aria-label="Zoom out" title="Zoom out (Ctrl -)">
          <TbMinus size={20} />
        </button>
        <button className={`${ROUND} w-9 h-9`} onClick={zoom.reset} aria-label="Reset zoom" title="Reset zoom (Ctrl 0)">
          <TbMaximize size={20} />
        </button>
      </div>
      {zoom.labelShown ? (
        <div className="absolute px-3 py-1 text-sm text-white -translate-x-1/2 rounded-full pointer-events-none left-1/2 top-4 bg-black/50" aria-label="Zoom level">
          {Math.round(zoom.scale * 100)}%
        </div>
      ) : null}
      {extra}
    </div>,
    document.body,
  );
}

/** An image, and the others of the chapter: the arrows go through them. */
export const ImageViewer = memo(function ImageViewer(
  { images, start, onClose }: { images: Extract<Media, { type: 'image' }>[]; start: number; onClose: () => void },
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoom = useZoom(containerRef);
  const [index, setIndex] = useState(start);
  const image = images[index];
  const go = (to: number) => {
    if (to < 0 || to >= images.length) return;
    setIndex(to);
    zoom.reset();
  };
  if (!image) return null;
  const prev = index > 0;
  const next = index < images.length - 1;

  return (
    <Overlay
      label="Image viewer"
      zoom={zoom}
      containerRef={containerRef}
      onClose={onClose}
      onKey={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          go(index + (e.key === 'ArrowLeft' ? -1 : 1));
          return true;
        }
        return false;
      }}
      extra={
        <>
          {prev ? (
            <button
              className={`${ROUND} absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11`}
              onClick={(e) => {
                e.stopPropagation();
                go(index - 1);
              }}
              aria-label="Previous image"
              title="Previous image (←)"
            >
              <TbChevronLeft size={26} />
            </button>
          ) : null}
          {next ? (
            <button
              className={`${ROUND} absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11`}
              onClick={(e) => {
                e.stopPropagation();
                go(index + 1);
              }}
              aria-label="Next image"
              title="Next image (→)"
            >
              <TbChevronRight size={26} />
            </button>
          ) : null}
        </>
      }
    >
      {/* the image, and its description below it */}
      <div className="flex flex-col items-center justify-center w-full h-full gap-3 px-16 py-14 pointer-events-none">
        <img
          src={image.src}
          alt={image.alt || 'Zoomed'}
          title={image.alt || undefined}
          draggable={false}
          className="object-contain max-w-full min-h-0 max-h-full pointer-events-auto"
          style={zoom.style}
          onPointerDown={zoom.onPointerDown}
          onClick={(e) => {
            e.stopPropagation();
            zoom.dragged.current = false;
          }}
          // double click: in to twice the size about the pointer, or back
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (zoom.scale === 1) zoom.zoomTo(2, zoom.anchorOf(e.clientX, e.clientY));
            else zoom.reset();
          }}
        />
        {image.alt ? (
          <p
            dir="auto"
            className="relative z-10 max-w-2xl px-4 py-2 overflow-y-auto text-sm text-center text-white rounded-lg pointer-events-auto shrink-0 max-h-32 bg-black/50 select-text"
            data-testid="image-caption"
            onClick={(e) => e.stopPropagation()}
          >
            {image.alt}
          </p>
        ) : null}
      </div>
    </Overlay>
  );
});

/** A table, wider than the page: alone, on the colors of the page. */
export const TableViewer = memo(function TableViewer(
  { html, colors, onClose }: { html: string; colors: { bg: string; fg: string }; onClose: () => void },
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoom = useZoom(containerRef);
  // from the book: no scripts, handlers or styles that reach the app
  const safe = useMemo(() => sanitizeHtml(html), [html]);
  const border = `color-mix(in srgb, ${colors.fg} 25%, transparent)`;

  return (
    <Overlay label="Table viewer" zoom={zoom} containerRef={containerRef} onClose={onClose}>
      <div
        className="media-table max-w-[calc(100%-6rem)] max-h-[calc(100%-6rem)] overflow-auto rounded-lg p-6 shadow-2xl select-text"
        style={{ ...zoom.style, background: colors.bg, color: colors.fg, ['--table-border' as string]: border }}
        onPointerDown={zoom.onPointerDown}
        onClick={(e) => {
          e.stopPropagation();
          zoom.dragged.current = false;
        }}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </Overlay>
  );
});
