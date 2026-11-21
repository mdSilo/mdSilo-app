import { memo, useCallback, useRef, useState } from "react";
import { useT } from "@/i18n";

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
  const onResizeEnd = useCallback(
    (w: number) => {
      saveWidth(clampWidth(w, bounds));
      setDragWidth(null);
    },
    [saveWidth, bounds],
  );

  return { width, onResize: setDragWidth, onResizeEnd };
}

type Props = {
  width: number;
  bounds: WidthBounds;
  label: string;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  /** the edge of the panel it is on: right (the default), or left for a panel on the right */
  edge?: "right" | "left";
  className?: string;
};

/**
 * Drag handle on the right edge of a panel (positioned) to resize its width.
 * Double click to reset, arrow keys to resize by keyboard.
 */
function ResizeHandle(props: Props) {
  const t = useT();
  const {
    width,
    bounds,
    label,
    onResize,
    onResizeEnd,
    edge = "right",
    className = "",
  } = props;
  // on the left edge, dragging to the left widens
  const sign = edge === "left" ? -1 : 1;
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragRef.current = { startX: e.clientX, startWidth: width, width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.width = clampWidth(
        drag.startWidth + sign * (e.clientX - drag.startX),
        bounds,
      );
      onResize(drag.width);
    },
    [onResize, bounds, sign],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onResizeEnd(drag.width);
    },
    [onResizeEnd],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 64 : 16;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onResizeEnd(width - sign * step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onResizeEnd(width + sign * step);
      }
    },
    [onResizeEnd, width, sign],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      title={t("Drag to resize, double click to reset")}
      className={`absolute top-0 bottom-0 z-10 w-1.5 ${edge === "left" ? "-left-0.5" : "-right-0.5"} cursor-col-resize select-none hover:bg-secondary/50 active:bg-secondary/70 focus:outline-hidden focus-visible:bg-secondary/50 ${className}`}
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
