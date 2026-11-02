import { useEffect } from "react";
import { store, useStore } from "@/state/store";
import { dataRoot } from "@/workspace/layout";
import type { ThemeInfo } from "@/lib/themes";
import {
  defineKind,
  drop,
  keep,
  merged,
  readWorkspaceList,
  writeWorkspaceList,
  type Where,
} from "./store";

/**
 * Themes made by the user: the variables of a daisyUI theme, applied as
 * `[data-theme="user-<id>"]` in a style element, so no CSS is built. Kept in
 * the workspace (`.mdsilo/themes.json`, synced) or on this device (settings).
 */
export type CustomTheme = {
  id: string;
  name: string;
  dark: boolean;
  /** `--color-base-100` ... `--radius-box`, values as CSS */
  vars: Record<string, string>;
  where: Where;
};

export const THEME_FILE = "themes.json";

/** The colors of a daisyUI theme, a color and the color of its content side by side. */
export const THEME_COLORS = [
  "base-100",
  "base-200",
  "base-300",
  "base-content",
  "primary",
  "primary-content",
  "secondary",
  "secondary-content",
  "accent",
  "accent-content",
  "neutral",
  "neutral-content",
  "info",
  "info-content",
  "success",
  "success-content",
  "warning",
  "warning-content",
  "error",
  "error-content",
];

/** The other variables of a daisyUI theme */
export const THEME_SIZES = [
  "--radius-selector",
  "--radius-field",
  "--radius-box",
  "--size-selector",
  "--size-field",
  "--border",
  "--depth",
  "--noise",
];

export const themeName = (theme: Pick<CustomTheme, "id">) => `user-${theme.id}`;

export const themeInfoOf = (theme: CustomTheme): ThemeInfo => ({
  name: themeName(theme),
  label: theme.name,
  dark: theme.dark,
});

// only variables, and values that can't end the rule
const VAR = /^--[a-z0-9-]+$/;
const cleanValue = (value: string) => value.replace(/[;{}<>]/g, "").trim();

/** The CSS of themes, as daisyUI themes. */
export function themeCss(themes: CustomTheme[]): string {
  return themes
    .map((theme) => {
      const vars = Object.entries(theme.vars)
        .filter(([key]) => VAR.test(key))
        .map(([key, value]) => `  ${key}: ${cleanValue(value)};`)
        .join("\n");
      return `[data-theme="${themeName(theme)}"] {\n  color-scheme: ${theme.dark ? "dark" : "light"};\n${vars}\n}`;
    })
    .join("\n");
}

/**
 * Read a theme from CSS, e.g. from the daisyUI theme generator:
 * `name: "x"; color-scheme: dark; --color-base-100: oklch(...); ...`
 */
export function parseThemeCss(
  text: string,
): Pick<CustomTheme, "name" | "dark" | "vars"> {
  const vars: Record<string, string> = {};
  let name = "";
  let dark = false;
  for (const [, key, raw] of text.matchAll(/([a-z0-9-]+)\s*:\s*([^;\n}]+)/gi)) {
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (key === "name") name = value;
    else if (key === "color-scheme") dark = value === "dark";
    else if (key.startsWith("--") && VAR.test(key))
      vars[key] = cleanValue(value);
  }
  return { name, dark, vars };
}

/** The variables of a theme applied, read from the page (to start a theme from it). */
export function themeVarsOf(dataTheme: string): Record<string, string> {
  const el = document.createElement("div");
  el.dataset.theme = dataTheme;
  el.hidden = true;
  document.body.appendChild(el);
  const style = getComputedStyle(el);
  const vars: Record<string, string> = {};
  for (const key of [
    ...THEME_COLORS.map((c) => `--color-${c}`),
    ...THEME_SIZES,
  ]) {
    const value = style.getPropertyValue(key).trim();
    if (value) vars[key] = value;
  }
  el.remove();
  return vars;
}

/** A CSS color as `#rrggbb`, for color inputs; '' if it can't be drawn. */
export function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  try {
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
    if (!ctx) return "";
    ctx.fillStyle = "#000";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "";
  }
}

/** A color and the color drawn on it, `[background, content]` */
export const CONTRAST_PAIRS: [string, string][] = [
  ["base-100", "base-content"],
  ["base-200", "base-content"],
  ["base-300", "base-content"],
  ...THEME_COLORS.filter(
    (c) => !c.startsWith("base") && !c.endsWith("-content"),
  ).map((c): [string, string] => [c, `${c}-content`]),
];

/** WCAG AA for normal text */
export const MIN_CONTRAST = 4.5;

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two CSS colors, 1 to 21; null if one can't be read. */
export function contrastRatio(a: string, b: string): number | null {
  const [x, y] = [toHex(a), toHex(b)];
  if (!x || !y) return null;
  const [hi, lo] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs of a theme whose content is hard to read on its color. */
export function lowContrast(
  vars: Record<string, string>,
): { bg: string; fg: string; ratio: number }[] {
  return CONTRAST_PAIRS.flatMap(([bg, fg]) => {
    const ratio = contrastRatio(
      vars[`--color-${bg}`] ?? "",
      vars[`--color-${fg}`] ?? "",
    );
    return ratio !== null && ratio < MIN_CONTRAST ? [{ bg, fg, ratio }] : [];
  });
}

/** Themes of the workspace win over those of this device with the same id. */
export const themes = defineKind<CustomTheme>({
  paths: [THEME_FILE],
  list: (where) =>
    where === "workspace"
      ? store.getState().workspaceThemes
      : store.getState().customThemes,
  save: async (where, items) => {
    if (where === "workspace") {
      await writeWorkspaceList(THEME_FILE, items);
      store.getState().setWorkspaceThemes(items);
    } else store.getState().setCustomThemes(items);
  },
  load: async () =>
    store
      .getState()
      .setWorkspaceThemes(await readWorkspaceList<CustomTheme>(THEME_FILE)),
});

/** Add or update a theme, where it is to be kept (moved there if it was elsewhere). */
export const saveTheme = (theme: CustomTheme) => keep(themes, theme);

export async function deleteTheme(id: string) {
  await drop(themes, id);
  const { theme, setTheme } = store.getState();
  if (theme === `user-${id}`) setTheme("system");
}

/** The themes of the user: of the workspace, then of this device. */
export const allCustomThemes = (state: {
  customThemes: CustomTheme[];
  workspaceThemes: CustomTheme[];
}) => merged(state.customThemes, state.workspaceThemes, "workspace");

const STYLE_ID = "mdsilo-custom-themes";

/** Apply CSS of themes on the page, `draft` for a theme being edited. */
export function applyThemeCss(themes: CustomTheme[], draft?: CustomTheme) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = themeCss(draft ? [...themes, draft] : themes);
}

/** Load the themes of the workspace opened, and apply all the custom themes. */
export function useCustomThemes() {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);

  useEffect(() => {
    const data = dataRoot({ initDir, layout });
    if (!data) {
      store.getState().setWorkspaceThemes([]);
      return;
    }
    let live = true;
    void readWorkspaceList<CustomTheme>(THEME_FILE, data).then((items) => {
      if (live) store.getState().setWorkspaceThemes(items);
    });
    return () => {
      live = false;
    };
  }, [initDir, layout]);

  useEffect(() => {
    applyThemeCss(allCustomThemes({ customThemes, workspaceThemes }));
  }, [customThemes, workspaceThemes]);
}
