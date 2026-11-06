import { useEffect } from "react";

/**
 * A phone rotated: some browsers (iOS, an installed web app) keep the page
 * scrolled or zoomed from the other orientation, so the top or the bottom of
 * the app is hidden. Put the page back at the origin once the rotation is
 * done, and again after the browser settled its bars.
 */
export default function useViewportReset() {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const reset = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      const root = document.scrollingElement;
      if (root && (root.scrollTop !== 0 || root.scrollLeft !== 0)) {
        root.scrollTo(0, 0);
      }
    };
    const onRotate = () => {
      reset();
      for (const delay of [100, 400]) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          reset();
        }, delay);
        timers.add(timer);
      }
    };
    window.addEventListener("orientationchange", onRotate);
    window.addEventListener("resize", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("orientationchange", onRotate);
      window.removeEventListener("resize", reset);
      window.visualViewport?.removeEventListener("resize", reset);
      timers.forEach(clearTimeout);
    };
  }, []);
}
