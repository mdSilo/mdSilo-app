import { useSyncExternalStore } from "react";
import { isMobile } from "@/lib/helper";

/**
 * Widest window laid out for a phone: below Tailwind's `md` (768px), so the
 * JS layout and the `md:` classes switch at the same width.
 */
export const MOBILE_MAX_WIDTH = 767;

/** whether the window is phone-sized now */
export const isMobileWidth = () => isMobile(MOBILE_MAX_WIDTH);

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

/** Whether the window is phone-sized; re-renders as it is resized or rotated. */
export default function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, isMobileWidth, () => false);
}
