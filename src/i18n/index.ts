/**
 * Translation of the UI.
 *
 * English is the base: the keys are the English text, and a locale file
 * (locales/<lang>.json) maps them to the translation; a key not translated
 * ("" or missing) shows in English.
 *
 *   const t = useT();          // in a component: re-renders on a new language
 *   t("Settings")
 *   t("{count} pages", { count: 2 })        // -> "2页" in zh-CN
 *   tn("{count} page", "{count} pages", n)  // one/other by the count
 *   tk("Explorer")             // marks a key for scripts/i18n.mjs, translated later with t()
 *   tr("Use {code} to skip", { code: <code>x</code> })  // elements in the text
 *
 * `node scripts/i18n.mjs find` lists the UI text not wrapped yet,
 * `node scripts/i18n.mjs sync` updates the locale files from the keys.
 */
import {
  createElement,
  Fragment,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Params = Record<string, string | number>;
type Dict = Record<string, string>;

/** the setting: a language, or the one of the system */
export const SYSTEM_LANGUAGE = "system";

/** the languages of the UI, by their own names */
export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["zh-CN", "简体中文"],
  ["zh-TW", "繁體中文"],
];

const loaders = import.meta.glob<{ default: Dict }>("./locales/*.json");

// the language last applied, to show it from the start before the settings load
const CACHE_KEY = "mdsilo-language";

let locale = "en";
let dict: Dict = {};
let version = 0;
// a new function per language, for the deps of useMemo and useCallback
let boundT: typeof t = (key, params) => t(key, params);
const listeners = new Set<() => void>();

/** a language of LANGUAGES for a setting, or a tag like navigator.language */
export function resolveLanguage(setting: string, system?: readonly string[]) {
  const tags =
    setting && setting !== SYSTEM_LANGUAGE
      ? [setting]
      : (system ??
        (typeof navigator === "undefined"
          ? []
          : (navigator.languages ?? [navigator.language])));
  for (const tag of tags) {
    if (!tag) continue;
    const lower = tag.toLowerCase();
    const exact = LANGUAGES.find(([code]) => code.toLowerCase() === lower);
    if (exact) return exact[0];
    if (lower.startsWith("zh")) {
      // Hant: Taiwan, Hong Kong, Macau
      return /hant|-tw|-hk|-mo/.test(lower) ? "zh-TW" : "zh-CN";
    }
    const base = lower.split("-")[0];
    const match = LANGUAGES.find(([code]) => code.split("-")[0] === base);
    if (match) return match[0];
  }
  return "en";
}

function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in params ? String(params[name]) : all,
  );
}

/** the text of `key` in the current language, with `{name}` replaced by `params` */
export function t(key: string, params?: Params): string {
  return interpolate(dict[key] || key, params);
}

/** `one` for a count of 1, `other` for the rest; `{count}` is the count */
export function tn(
  one: string,
  other: string,
  count: number,
  params?: Params,
): string {
  return t(count === 1 ? one : other, { count, ...params });
}

/**
 * `t` with elements in the text: a sentence stays whole for the translators
 * where a part of it is <code>, <b> or a link.
 */
export function tr(key: string, values: Record<string, ReactNode>): ReactNode {
  const text = dict[key] || key;
  const parts = text.split(/\{(\w+)\}/);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const value = part in values ? values[part] : `{${part}}`;
    return createElement(Fragment, { key: i }, value);
  });
}

/** marks a key for scripts/i18n.mjs where it's kept to be translated later */
export function tk<T extends string>(key: T): T {
  return key;
}

/** the current language of the UI */
export function getLocale() {
  return locale;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** set the language of the UI, a language of LANGUAGES or "system" */
export async function setLanguage(setting: string) {
  const next = resolveLanguage(setting);
  try {
    localStorage.setItem(CACHE_KEY, setting);
  } catch {
    // no storage: from the settings next time
  }
  if (next === locale && (next === "en" || version > 0)) return;
  let nextDict: Dict = {};
  const load = loaders[`./locales/${next}.json`];
  if (load) {
    try {
      nextDict = (await load()).default;
    } catch (e) {
      console.error(`could not load the language ${next}`, e);
    }
  }
  locale = next;
  dict = nextDict;
  version += 1;
  boundT = (key, params) => t(key, params);
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
  listeners.forEach((fn) => fn());
}

/** the language last applied, before the first render */
export function initI18n() {
  let setting = SYSTEM_LANGUAGE;
  try {
    setting = localStorage.getItem(CACHE_KEY) || SYSTEM_LANGUAGE;
  } catch {
    // no storage
  }
  return setLanguage(setting);
}

/** `t`, re-rendering the component when the language changes */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, () => version);
  return boundT;
}
