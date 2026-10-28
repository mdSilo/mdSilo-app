import { describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { store } from '@/lib/store';
import useTheme from './useTheme';

describe('useTheme', () => {
  test('applies the theme on <html>', () => {
    store.getState().setTheme('mdsilo-dark');
    renderHook(() => useTheme());
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('mdsilo-dark');
    expect(root).toHaveClass('dark');
    expect(store.getState().darkMode).toBe(true);

    act(() => store.getState().setTheme('cupcake'));
    expect(root.dataset.theme).toBe('cupcake');
    expect(root).not.toHaveClass('dark');
    expect(store.getState().darkMode).toBe(false);
  });

  test('the system theme follows the system dark mode', () => {
    store.getState().setTheme('system');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('mdsilo-dark');
    expect(store.getState().darkMode).toBe(true);
  });

  test('an unknown theme falls back to the mdSilo theme of the system mode', () => {
    store.getState().setTheme('gone');
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('mdsilo-light');
  });
});
