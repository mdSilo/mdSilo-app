import { describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { ProvideCurrentView, useCurrentViewContext } from './useCurrentView';
import { ProvideCurrentMd, useCurrentMdContext } from './useCurrentMd';

describe('useCurrentViewContext', () => {
  test('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useCurrentViewContext())).toThrow(/within a provider/);
    vi.restoreAllMocks();
  });

  test('provides state and dispatch', () => {
    const { result } = renderHook(() => useCurrentViewContext(), {
      wrapper: ({ children }: { children: ReactNode }) => <ProvideCurrentView>{children}</ProvideCurrentView>,
    });
    expect(result.current.state).toEqual({ view: 'default' });
    act(() => result.current.dispatch({ view: 'graph' }));
    expect(result.current.state.view).toBe('graph');
  });
});

describe('useCurrentMdContext', () => {
  test('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useCurrentMdContext())).toThrow(/within a provider/);
    vi.restoreAllMocks();
  });

  test('returns the provided value', () => {
    const value = { ty: 'md', id: '/a.md', state: { view: 'md' }, dispatch: vi.fn() };
    const { result } = renderHook(() => useCurrentMdContext(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ProvideCurrentMd value={value}>{children}</ProvideCurrentMd>
      ),
    });
    expect(result.current).toBe(value);
  });
});
