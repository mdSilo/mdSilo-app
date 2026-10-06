import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store, SidebarTab } from 'lib/store';
import App from './App';

const press = (key: string, keyCode: number, mods: Record<string, boolean>) =>
  act(() => {
    fireEvent.keyDown(document, { key, keyCode, which: keyCode, ...mods });
  });

describe('App', () => {
  test('renders the shell and closes the splashscreen', async () => {
    store.getState().setIsOpenPreOn(false);
    await act(async () => {
      render(<App />);
    });
    expect(invoke).toHaveBeenCalledWith('close_splashscreen');
    expect(document.getElementById('app-container')).toHaveClass('dark');
    expect(screen.getByText('Hello, welcome to mdSilo.')).toBeInTheDocument();
    // the logo menu (first side menu button) replaced the sidebar header
    expect(document.querySelector('#side-menu-btns button')).toBeInTheDocument();
  });

  test('uses light mode when dark mode is off', async () => {
    store.getState().setIsOpenPreOn(false);
    store.getState().setDarkMode(false);
    await act(async () => {
      render(<App />);
    });
    expect(document.getElementById('app-container')).not.toHaveClass('dark');
  });

  test('global hotkeys toggle panels and tabs', async () => {
    store.getState().setIsOpenPreOn(false);
    vi.mocked(invoke).mockResolvedValue([]);
    await act(async () => {
      render(<App />);
    });
    press('x', 88, { altKey: true });
    expect(store.getState().isSidebarOpen).toBe(false);

    press('f', 70, { ctrlKey: true, shiftKey: true });
    expect(store.getState().sidebarTab).toBe(SidebarTab.Search);
    press('h', 72, { ctrlKey: true, shiftKey: true });
    expect(store.getState().sidebarTab).toBe(SidebarTab.Hashtag);
    press('p', 80, { ctrlKey: true, shiftKey: true });
    expect(store.getState().sidebarTab).toBe(SidebarTab.Playlist);
    press('d', 68, { ctrlKey: true, shiftKey: true });
    expect(store.getState().sidebarTab).toBe(SidebarTab.Silo);

    press('n', 78, { ctrlKey: true });
    expect(store.getState().isFindOrCreateModalOpen).toBe(true);
    expect(screen.getByPlaceholderText('new or find')).toBeInTheDocument();
    press('s', 83, { ctrlKey: true });
  });

  test('opens settings and about modals from the store', async () => {
    store.getState().setIsOpenPreOn(false);
    await act(async () => {
      render(<App />);
    });
    await userEvent.click(document.querySelector('#side-menu-btns button') as HTMLElement);
    await userEvent.click(screen.getByText('Settings'));
    expect(await screen.findByText('Editor Font Family')).toBeInTheDocument();
    act(() => store.getState().setIsSettingsOpen(false));
    act(() => store.getState().setIsAboutOpen(true));
    expect(await screen.findByText('mdSilo Desktop')).toBeInTheDocument();
  });
});
