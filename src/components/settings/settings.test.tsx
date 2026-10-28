import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { BaseModal } from '@/ui/BaseModal';
import SettingsModal from './SettingsModal';
import EditorSettings from './EditorSettings';
import AboutModal from './AboutModal';

describe('BaseModal', () => {
  test('renders title and children when open', async () => {
    render(<BaseModal title="Hello" isOpen handleClose={vi.fn()}><p>body</p></BaseModal>);
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  test('closes on a click outside the panel', async () => {
    const handleClose = vi.fn();
    render(<BaseModal title="Hello" isOpen handleClose={handleClose}><p>body</p></BaseModal>);
    await screen.findByText('Hello');
    fireEvent.click(document.querySelector('.bg-gray-500\\/75') as HTMLElement);
    expect(handleClose).toHaveBeenCalled();
    handleClose.mockClear();
    fireEvent.click(screen.getByText('body'));
    expect(handleClose).not.toHaveBeenCalled();
  });

  test('renders nothing when closed', () => {
    render(<BaseModal title="Hello" isOpen={false} handleClose={vi.fn()}><p>body</p></BaseModal>);
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  test('closes with the X icon', async () => {
    const handleClose = vi.fn();
    render(<BaseModal title="Hello" isOpen handleClose={handleClose}><p>body</p></BaseModal>);
    const title = await screen.findByText('Hello');
    const closeIcon = title.closest('.inline-block')?.querySelector('svg') as SVGElement;
    fireEvent.click(closeIcon);
    expect(handleClose).toHaveBeenCalled();
  });
});

describe('SettingsModal', () => {
  test('updates the global settings', async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText('Settings');

    const themeSelect = screen.getByLabelText('Theme');
    expect(themeSelect).toHaveValue('system');
    fireEvent.change(themeSelect, { target: { value: 'dracula' } });
    expect(store.getState().theme).toBe('dracula');

    fireEvent.change(screen.getByLabelText('Side Menu Orientation'), { target: { value: 'horizontal' } });
    expect(store.getState().sideMenuOrientation).toBe('horizontal');

    const openOn = screen.getByLabelText('Open on Startup');
    expect(openOn).toHaveValue('previous');
    fireEvent.change(openOn, { target: { value: 'pinned' } });
    expect(store.getState().openOnStartup).toBe('pinned');

    const startupView = screen.getByLabelText('View on Startup');
    expect(startupView).toHaveValue('notes');
    fireEvent.change(startupView, { target: { value: 'library' } });
    expect(store.getState().startupView).toBe('library');
  });

  test('has no editor settings', async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText('Settings');
    expect(screen.queryByLabelText('Editor Font Family')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });
});

describe('EditorSettings', () => {
  test('updates the editor settings', async () => {
    render(<EditorSettings />);

    fireEvent.change(screen.getByLabelText('Editor Font Family'), { target: { value: 'Sniglet' } });
    expect(store.getState().font).toBe('Sniglet');

    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Line Height'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Font Weight'), { target: { value: '700' } });
    expect(store.getState().fontSize).toBe(1.5);
    expect(store.getState().lineHeight).toBe(2);
    expect(store.getState().fontWt).toBe(700);

    await userEvent.click(screen.getByLabelText('Right to Left'));
    expect(store.getState().isRTL).toBe(true);
    await userEvent.click(screen.getByLabelText('Spell Check'));
    expect(store.getState().isCheckSpellOn).toBe(false);
    await userEvent.click(screen.getByLabelText('Use Assets Folder'));
    expect(store.getState().useAsset).toBe(false);
  });

  test('falls back to defaults for invalid numbers', () => {
    render(<EditorSettings />);
    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Line Height'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Font Weight'), { target: { value: '' } });
    expect(store.getState().fontSize).toBe(1.1);
    expect(store.getState().lineHeight).toBe(1.6);
    expect(store.getState().fontWt).toBe(400);
  });
});

describe('AboutModal', () => {
  test('shows versions and handles actions', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => (cmd === 'get_log' ? [{ ty: 'x' }] : undefined));

    render(<AboutModal isOpen handleClose={vi.fn()} />);
    expect(await screen.findByText('App Version: 0.0.0-test')).toBeInTheDocument();
    expect(await screen.findByText('Tauri Version: 2.0.0-test')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Clear Log'));
    expect(invoke).toHaveBeenCalledWith('del_log');

    await userEvent.click(screen.getByText('Copy About'));
    expect(writeText).toHaveBeenCalledWith('App: 0.0.0-test \n Tauri: 2.0.0-test');

    await userEvent.click(screen.getByText('Copy Log'));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('[{"ty":"x"}]'));

    await userEvent.click(screen.getByText('Check for Updates'));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://github.com/mdSilo/mdSilo-app/releases' });
  });
});
