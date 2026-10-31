import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { resolveTheme } from '@/lib/themes';
import {
  allCustomThemes, deleteTheme, parseThemeCss, saveTheme, themeCss, themeInfoOf, type CustomTheme,
} from './themes';

const theme = (patch: Partial<CustomTheme> = {}): CustomTheme => ({
  id: 't1', name: 'Mine', dark: true, vars: { '--color-base-100': 'oklch(20% 0 0)' }, where: 'device', ...patch,
});

beforeEach(() => {
  store.setState({ customThemes: [], workspaceThemes: [], initDir: undefined, layout: undefined, theme: 'system' });
});

it('makes the CSS of a daisyUI theme', () => {
  expect(themeCss([theme()])).toBe(
    '[data-theme="user-t1"] {\n  color-scheme: dark;\n  --color-base-100: oklch(20% 0 0);\n}'
  );
});

it('keeps only variables, and values that cannot break out of the rule', () => {
  const css = themeCss([theme({ vars: { '--color-primary': 'red; } body { color: red', 'color': 'blue' } })]);
  expect(css).toContain('--color-primary: red  body  color: red;');
  expect(css).not.toContain('}\n}');
  expect(css).not.toContain('color: blue');
});

it('reads a theme from the CSS of the daisyUI theme generator', () => {
  const parsed = parseThemeCss(`@plugin "daisyui/theme" {
    name: "sunset";
    default: false;
    color-scheme: "dark";
    --color-base-100: oklch(22% 0.019 237.69);
    --color-primary: oklch(74% 0.16 232.661);
    --radius-box: 0.5rem;
  }`);
  expect(parsed).toEqual({
    name: 'sunset',
    dark: true,
    vars: {
      '--color-base-100': 'oklch(22% 0.019 237.69)',
      '--color-primary': 'oklch(74% 0.16 232.661)',
      '--radius-box': '0.5rem',
    },
  });
});

it('resolves a theme made by the user', () => {
  const info = themeInfoOf(theme());
  expect(resolveTheme('user-t1', false, [info])).toEqual({ name: 'user-t1', label: 'Mine', dark: true });
  expect(resolveTheme('user-gone', false, [info]).name).toBe('mdsilo-light');
});

it('keeps a theme on the device, in the settings', async () => {
  await saveTheme(theme());
  expect(store.getState().customThemes).toEqual([theme()]);
  expect(invoke).not.toHaveBeenCalledWith('write_file', expect.anything());
});

it('keeps a theme in the workspace, and moves it there from the device', async () => {
  store.setState({ initDir: '/ws', layout: 'workspace', customThemes: [theme()] });
  await saveTheme(theme({ where: 'workspace' }));
  expect(invoke).toHaveBeenCalledWith('write_file', {
    filePath: '/ws/.mdsilo/themes.json',
    text: `${JSON.stringify([{ id: 't1', name: 'Mine', dark: true, vars: theme().vars }], null, 2)}\n`,
  });
  expect(store.getState().customThemes).toEqual([]);
  expect(store.getState().workspaceThemes).toEqual([theme({ where: 'workspace' })]);
});

it('cannot keep a theme in the workspace without one', async () => {
  await expect(saveTheme(theme({ where: 'workspace' }))).rejects.toThrow('No workspace');
});

it('deletes a theme, back to the system theme if it was applied', async () => {
  store.setState({ customThemes: [theme()], theme: 'user-t1' });
  await deleteTheme('t1');
  expect(store.getState().customThemes).toEqual([]);
  expect(store.getState().theme).toBe('system');
});

it('lists the themes of the workspace first, without the same theme twice', () => {
  const ws = theme({ name: 'Synced', where: 'workspace' });
  const other = theme({ id: 't2' });
  expect(allCustomThemes({ workspaceThemes: [ws], customThemes: [theme(), other] })).toEqual([ws, other]);
});
