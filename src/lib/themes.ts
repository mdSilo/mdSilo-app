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

const v = (name: string) => `var(--color-${name})`;
/** a daisyUI color at `percent` opacity */
const mix = (name: string, percent: number) =>
  `color-mix(in oklch, var(--color-${name}) ${percent}%, transparent)`;

/** colors of the mdsmirror editor from the daisyUI theme, so any theme fits */
export const EDITOR_THEME = {
  background: v('base-100'),
  text: v('base-content'),
  cursor: v('base-content'),
  code: v('base-content'),
  divider: v('base-300'),
  placeholder: mix('base-content', 40),
  textSecondary: mix('base-content', 70),
  textTertiary: mix('base-content', 55),
  textHighlight: mix('accent', 45),
  textHighlightForeground: v('base-content'),
  selected: v('primary'),
  link: v('secondary'),
  hashtag: v('primary'),
  quote: v('primary'),
  secondaryBackground: v('base-300'),

  toolbarBackground: v('neutral'),
  toolbarHoverBackground: mix('neutral-content', 20),
  toolbarInput: mix('neutral-content', 10),
  toolbarItem: v('neutral-content'),

  blockToolbarBackground: v('base-100'),
  blockToolbarTrigger: mix('base-content', 40),
  blockToolbarTriggerIcon: v('base-100'),
  blockToolbarItem: v('base-content'),
  blockToolbarIconSelected: v('base-content'),
  blockToolbarText: v('base-content'),
  blockToolbarTextSelected: v('base-content'),
  blockToolbarSelectedBackground: v('base-300'),
  blockToolbarHoverBackground: v('base-200'),
  blockToolbarDivider: v('base-300'),

  tableDivider: v('base-300'),
  tableHeaderBackground: v('base-300'),
  tableSelected: v('primary'),
  tableSelectedBackground: mix('primary', 15),

  codeBackground: v('base-200'),
  codeBorder: v('base-300'),
  horizontalRule: v('base-300'),
  imageErrorBackground: v('base-200'),
  scrollbarBackground: v('base-200'),
  scrollbarThumb: v('base-300'),

  noticeInfoBackground: v('info'),
  noticeInfoText: v('info-content'),
  noticeTipBackground: v('success'),
  noticeTipText: v('success-content'),
  noticeWarningBackground: v('warning'),
  noticeWarningText: v('warning-content'),

  codeComment: mix('base-content', 50),
  codePunctuation: mix('base-content', 70),
  codeNumber: v('warning'),
  codeProperty: v('info'),
  codeTag: v('info'),
  codeString: v('success'),
  codeSelector: v('secondary'),
  codeAttr: v('warning'),
  codeEntity: v('info'),
  codeKeyword: v('error'),
  codeFunction: v('secondary'),
  codeStatement: v('error'),
  codePlaceholder: v('info'),
  codeInserted: v('success'),
  codeImportant: v('error'),
};
