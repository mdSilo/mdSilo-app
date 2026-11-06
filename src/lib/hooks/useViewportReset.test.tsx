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
});
