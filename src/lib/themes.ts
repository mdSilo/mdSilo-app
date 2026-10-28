// daisyUI themes, defined in styles/styles.css
export type ThemeInfo = { name: string; label: string; dark: boolean };

export const THEMES: readonly ThemeInfo[] = [
  { name: 'mdsilo-light', label: 'Light', dark: false },
  { name: 'mdsilo-dark', label: 'Dark', dark: true },
  { name: 'cupcake', label: 'Cupcake', dark: false },
  { name: 'nord', label: 'Nord', dark: false },
  { name: 'retro', label: 'Retro', dark: false },
  { name: 'lemonade', label: 'Lemonade', dark: false },
  { name: 'dracula', label: 'Dracula', dark: true },
  { name: 'forest', label: 'Forest', dark: true },
  { name: 'dim', label: 'Dim', dark: true },
  { name: 'night', label: 'Night', dark: true },
];

/** follow the light or dark mode of the system */
export const SYSTEM_THEME = 'system';

export const LIGHT_THEME = THEMES[0];
export const DARK_THEME = THEMES[1];

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The system is in dark mode */
export const isSystemDark = () =>
  typeof window !== 'undefined' && (window.matchMedia?.(DARK_QUERY)?.matches ?? false);

/** The theme to apply for a theme setting, `system` or unknown theme by the system mode. */
export function resolveTheme(theme: string, systemDark: boolean): ThemeInfo {
  return THEMES.find((t) => t.name === theme) ?? (systemDark ? DARK_THEME : LIGHT_THEME);
}

/** colors of the mdsmirror editor from the daisyUI theme */
export const EDITOR_THEME = {
  background: 'var(--color-base-100)',
  text: 'var(--color-base-content)',
  cursor: 'var(--color-base-content)',
};
