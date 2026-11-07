import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useViewportReset from "./useViewportReset";

describe("useViewportReset", () => {
  afterEach(() => vi.restoreAllMocks());

  test("puts a scrolled page back after a rotation", () => {
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { value: 40, configurable: true });
    const { unmount } = renderHook(() => useViewportReset());
    window.dispatchEvent(new Event("orientationchange"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockClear();
    vi.advanceTimersByTime(500);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    unmount();
    scrollTo.mockClear();
    window.dispatchEvent(new Event("orientationchange"));
    vi.advanceTimersByTime(500);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    vi.useRealTimers();
  });

  test("leaves the page as it is on a resize of the same orientation", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const size = (w: number, h: number) => {
      Object.defineProperty(window, "innerWidth", {
        value: w,
        configurable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: h,
        configurable: true,
      });
    };
    size(400, 800);
    Object.defineProperty(window, "scrollY", { value: 40, configurable: true });
    const { unmount } = renderHook(() => useViewportReset());
    // the keyboard opens: shorter, iOS scrolled to the field typed in
    size(400, 500);
    window.dispatchEvent(new Event("resize"));
    expect(scrollTo).not.toHaveBeenCalled();
    // rotated, where no orientationchange is fired
    size(800, 400);
    window.dispatchEvent(new Event("resize"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    unmount();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    size(1024, 768);
  });
});
