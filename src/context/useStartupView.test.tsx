import { describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SidebarTab, store } from '@/lib/store';
import { ProvideCurrentView, useCurrentViewContext } from './useCurrentView';
import useStartupView from './useStartupView';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProvideCurrentView>{children}</ProvideCurrentView>
);

const renderStartup = () => renderHook(() => {
  useStartupView();
  return useCurrentViewContext();
}, { wrapper });

const openFolder = (layout: 'workspace' | 'legacy' = 'workspace') => act(() => {
  store.getState().setLayout(layout);
  store.getState().setInitDir('/ws');
});

describe('useStartupView', () => {
  test('shows the explorer by default', () => {
    store.getState().setSidebarTab(SidebarTab.Search);
    const { result } = renderStartup();
    expect(result.current.state.view).toBe('default');
    expect(store.getState().sidebarTab).toBe(SidebarTab.Silo);
  });

  test('shows the feed at once, w/o the sidebar', () => {
    store.getState().setStartupView('feed');
    const { result } = renderStartup();
    expect(result.current.state.view).toBe('feed');
    expect(store.getState().isSidebarOpen).toBe(false);
  });

  test('shows a view of a folder once the folder is open', () => {
    store.getState().setStartupView('issues');
    const { result } = renderStartup();
    expect(result.current.state.view).toBe('default');
    openFolder();
    expect(result.current.state.view).toBe('issues');
    // once only
    act(() => result.current.dispatch({ view: 'graph' }));
    act(() => store.getState().setInitDir('/other'));
    expect(result.current.state.view).toBe('graph');
  });

  test('shows the view at once if the folder is open', () => {
    store.getState().setStartupView('chronicle');
    store.getState().setInitDir('/ws');
    const { result } = renderStartup();
    expect(result.current.state.view).toBe('chronicle');
  });

  test('keeps the view the user went to meanwhile', () => {
    store.getState().setStartupView('project');
    const { result } = renderStartup();
    act(() => result.current.dispatch({ view: 'feed' }));
    openFolder();
    expect(result.current.state.view).toBe('feed');
  });

  test('shows the library in a workspace only', () => {
    store.getState().setStartupView('library');
    const { result } = renderStartup();
    openFolder('legacy');
    expect(result.current.state.view).toBe('default');
  });
});
