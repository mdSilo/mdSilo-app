import { useCallback, useRef, type RefObject } from "react";
import { create } from "zustand";
import { store, useStore } from "@/state/store";
import { useT } from "@/i18n";

/** The pane beside: from a fifth to four fifths of the two, half at first */
export const BESIDE_WIDTH = { min: 20, max: 80, default: 50 } as const;

export const clampPercent = (percent: number) =>
  Math.min(
    BESIDE_WIDTH.max,
    Math.max(
      BESIDE_WIDTH.min,
      Number.isFinite(percent) ? percent : BESIDE_WIDTH.default,
    ),
  );

/** the width while dragged: saved (persisted) once released */
const useDragged = create<{ percent: number | null }>(() => ({
  percent: null,
}));

/** The width of the pane beside, in % of the two: as dragged, or as saved. */
export function useBesideWidth(): number {
  const saved = useStore((s) => s.besideWidth);
  const dragged = useDragged((s) => s.percent);
  return clampPercent(dragged ?? saved);
}

/** The style of the pane beside: its share of the width, a usable column at least. */
export const besideStyle = (percent: number) => ({
  flex: `0 0 ${percent}%`,
  minWidth: "16rem",
});

const save = (percent: number) => {
  useDragged.setState({ percent: null });
  store.getState().setBesideWidth(Math.round(clampPercent(percent)));
};

type Props = {
  /** the box of the two panes, the handle between them */
  containerRef: RefObject<HTMLElement | null>;
};

/**
 * The line between two panes side by side (parallel reading and writing):
 * dragged to share the width between them. Double click for half and half,
 * the arrow keys to move it.
 */
export default function SplitHandle({ containerRef }: Props) {
  const t = useT();
  const percent = useBesideWidth();
  const onLeft = useStore((s) => s.besideOnLeft);
  const dragging = useRef(false);
  const frame = useRef(0);

  // the width of the pane beside at a point of the window
  const percentAt = useCallback(
    (x: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return percent;
      const side = onLeft ? x - box.left : box.right - x;
      return clampPercent((side / box.width) * 100);
    },
    [containerRef, onLeft, percent],
  );

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(frame.current);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    save(percentAt(e.clientX));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize the two sides")}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={BESIDE_WIDTH.min}
      aria-valuemax={BESIDE_WIDTH.max}
      tabIndex={0}
      title={t("Drag to resize, double click to reset")}
      className="relative z-10 w-px shrink-0 bg-base-300 cursor-col-resize select-none focus:outline-hidden before:absolute before:inset-y-0 before:-left-1 before:-right-1 before:content-[''] hover:bg-secondary/70 active:bg-secondary focus-visible:bg-secondary"
      data-testid="split-handle"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        // over the frame of a book too: the moves come here
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragging.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const x = e.clientX;
        // once a frame: a book lays its pages out again on each width
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() =>
          useDragged.setState({ percent: percentAt(x) }),
        );
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => save(BESIDE_WIDTH.default)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        // the line moves as the arrow says, whichever side the pane is on
        const step = (e.shiftKey ? 10 : 2) * (e.key === "ArrowLeft" ? -1 : 1);
        save(percent + (onLeft ? step : -step));
      }}
    />
  );
}
