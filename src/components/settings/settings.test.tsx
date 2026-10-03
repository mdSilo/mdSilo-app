import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { BaseModal } from './BaseModal';
import { SettingsToggle } from './SettingsToggle';
import SettingsModal from './SettingsModal';
import AboutModal from './AboutModal';

describe('BaseModal', () => {
  test('renders title and children when open', async () => {
    render(<BaseModal title="Hello" isOpen handleClose={vi.fn()}><p>body</p></BaseModal>);
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
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

describe('SettingsToggle', () => {
  test('renders labels and toggles', async () => {
    const handleCheck = vi.fn();
    render(<SettingsToggle name="Dark Theme" descript="desc" check={false} handleCheck={handleCheck} />);
    expect(screen.getByText('Dark Theme')).toBeInTheDocument();
    expect(screen.getByText('desc')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'Dark-Theme');
    await userEvent.click(checkbox);
    expect(handleCheck).toHaveBeenCalledWith(true);
  });
});

describe('SettingsModal', () => {
  test('updates store settings', async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText('Settings');

    const darkToggle = screen.getByLabelText('', { selector: '#Theme' });
    await userEvent.click(darkToggle);
    expect(store.getState().darkMode).toBe(false);

    await userEvent.click(screen.getByLabelText('', { selector: '#Text-Direction' }));
    expect(store.getState().isRTL).toBe(true);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Sniglet' } });
    expect(store.getState().font).toBe('Sniglet');

    const [size, height, weight] = screen.getAllByRole('spinbutton');
    fireEvent.change(size, { target: { value: '1.5' } });
    fireEvent.change(height, { target: { value: '2' } });
    fireEvent.change(weight, { target: { value: '700' } });
    expect(store.getState().fontSize).toBe(1.5);
    expect(store.getState().lineHeight).toBe(2);
    expect(store.getState().fontWt).toBe(700);
  });

  test('falls back to defaults for invalid numbers', async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText('Settings');
    const [size, height, weight] = screen.getAllByRole('spinbutton');
    fireEvent.change(size, { target: { value: '' } });
    fireEvent.change(height, { target: { value: '' } });
    fireEvent.change(weight, { target: { value: '' } });
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
