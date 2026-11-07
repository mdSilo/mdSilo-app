import { useEffect } from "react";

const isLandscape = () => window.innerWidth > window.innerHeight;

/**
 * A phone rotated: some browsers (iOS, an installed web app) keep the page
 * scrolled or zoomed from the other orientation, so the top or the bottom of
 * the app is hidden. Put the page back at the origin once the rotation is
 * done, and again after the browser settled its bars.
 *
 * On a rotation only: when the keyboard opens, iOS scrolls the page to show
 * the field typed in, which must stay so.
 */
export default function useViewportReset() {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let landscape = isLandscape();
    const reset = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      const root = document.scrollingElement;
      if (root && (root.scrollTop !== 0 || root.scrollLeft !== 0)) {
        root.scrollTo(0, 0);
      }
    };
    const onRotate = () => {
      landscape = isLandscape();
      reset();
      for (const delay of [100, 400]) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          reset();
        }, delay);
        timers.add(timer);
      }
    };
    // where orientationchange is not fired: a resize that flips the screen
    const onResize = () => {
      if (isLandscape() !== landscape) onRotate();
    };
    window.addEventListener("orientationchange", onRotate);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("orientationchange", onRotate);
      window.removeEventListener("resize", onResize);
      timers.forEach(clearTimeout);
    };
  }, []);
}
