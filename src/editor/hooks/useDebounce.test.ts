import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDebounce from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('delays value updates', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    });
    expect(result.current[0]).toBe('a');

    rerender({ value: 'b' });
    expect(result.current[0]).toBe('a');
    act(() => vi.advanceTimersByTime(499));
    expect(result.current[0]).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('b');
  });

  test('only emits the last of rapid updates', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    act(() => vi.advanceTimersByTime(50));
    rerender({ value: 3 });
    act(() => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe(1);
    act(() => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe(3);
  });

  test('exposes a setter for immediate updates', () => {
    const { result } = renderHook(() => useDebounce('a', 100));
    act(() => result.current[1]('now'));
    expect(result.current[0]).toBe('now');
  });
});
