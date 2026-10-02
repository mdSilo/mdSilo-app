import { describe, expect, test, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import useHotkeys from './useHotkeys';

describe('useHotkeys', () => {
  test('calls the matching callback and prevents default', () => {
    const onX = vi.fn();
    const onY = vi.fn();
    renderHook(() =>
      useHotkeys([
        { hotkey: 'alt+x', callback: onX },
        { hotkey: 'shift+y', callback: onY },
      ])
    );
    // is-hotkey matches on keyCode/which
    const notPrevented = fireEvent.keyDown(document, { key: 'x', keyCode: 88, which: 88, altKey: true });
    expect(onX).toHaveBeenCalledTimes(1);
    expect(onY).not.toHaveBeenCalled();
    expect(notPrevented).toBe(false);
  });

  test('ignores non-matching keys', () => {
    const cb = vi.fn();
    renderHook(() => useHotkeys([{ hotkey: 'alt+x', callback: cb }]));
    fireEvent.keyDown(document, { key: 'x', keyCode: 88, which: 88 });
    expect(cb).not.toHaveBeenCalled();
  });

  test('removes the listener on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useHotkeys([{ hotkey: 'escape', callback: cb }]));
    unmount();
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27, which: 27 });
    expect(cb).not.toHaveBeenCalled();
  });
});
