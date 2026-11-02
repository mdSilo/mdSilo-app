import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

// themed in styles/styles.css: as the native scrollbars
const OPTIONS = {
  scrollbars: {
    theme: "os-theme-mdsilo",
    autoHide: "move",
    autoHideDelay: 800,
  },
} as const;

/**
 * An element scrolled, kept, e.g. to give to `scroller` below: from a ref,
 * or from the `scrollerRef` of a react-virtuoso list.
 */
export function useScroller() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const ref = useCallback(
    (el: HTMLElement | Window | null) =>
      setScroller(el instanceof HTMLElement ? el : null),
    [],
  );
  return [scroller, ref] as const;
}

type Props = {
  /** the element scrolled, a child: it scrolls itself still (sticky, virtualized lists) */
  scroller: HTMLElement | null;
  className?: string;
  children: ReactNode;
};

/** Overlay scrollbars, of the theme, on an element that scrolls. */
export default function OverlayScroll({
  scroller,
  className,
  children,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [initialize, instance] = useOverlayScrollbars({
    options: OPTIONS,
    defer: true,
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !scroller) return;
    initialize({ target: root, elements: { viewport: scroller } });
    return () => instance()?.destroy();
  }, [scroller, initialize, instance]);
  return (
    <div
      ref={rootRef}
      className={className}
      data-overlayscrollbars-initialize=""
    >
      {children}
    </div>
  );
}
