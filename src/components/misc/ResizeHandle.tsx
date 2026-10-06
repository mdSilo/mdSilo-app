import { memo, useCallback, useRef, useState } from 'react';

export type WidthBounds = {
  readonly min: number;
  readonly max: number;
  readonly default: number;
};

export const clampWidth = (width: number, bounds: WidthBounds) => {
  const w = Number.isFinite(width) ? width : bounds.default;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, w)));
};

/**
 * Width of a resizable panel: follows the drag locally,
 * saves (e.g. to persisted store) only once on release.
 */
export function useResizableWidth(
  savedWidth: number,
  saveWidth: (width: number) => void,
  bounds: WidthBounds,
) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = clampWidth(dragWidth ?? savedWidth, bounds);
  const onResizeEnd = useCallback((w: number) => {
    saveWidth(clampWidth(w, bounds));
    setDragWidth(null);
  }, [saveWidth, bounds]);

  return { width, onResize: setDragWidth, onResizeEnd };
}

type Props = {
  width: number;
  bounds: WidthBounds;
  label: string;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  className?: string;
};

/**
 * Drag handle on the right edge of a panel (positioned) to resize its width.
 * Double click to reset, arrow keys to resize by keyboard.
 */
function ResizeHandle(props: Props) {
  const { width, bounds, label, onResize, onResizeEnd, className = '' } = props;
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: width, width };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.width = clampWidth(drag.startWidth + e.clientX - drag.startX, bounds);
    onResize(drag.width);
  }, [onResize, bounds]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onResizeEnd(drag.width);
  }, [onResizeEnd]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onResizeEnd(width - step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onResizeEnd(width + step);
    }
  }, [onResizeEnd, width]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      title="Drag to resize, double click to reset"
      className={`absolute top-0 bottom-0 z-10 w-1.5 -right-0.5 cursor-col-resize select-none hover:bg-blue-500/50 active:bg-blue-500/70 focus:outline-none focus-visible:bg-blue-500/50 ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onResizeEnd(bounds.default)}
      onKeyDown={onKeyDown}
    />
  );
}

export default memo(ResizeHandle);
