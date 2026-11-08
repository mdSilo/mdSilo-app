import { useEffect, useMemo } from "react";
import { useStore } from "@/state/store";
import { formatSize } from "@/workspace/syncSize";
import { dataRoot } from "@/workspace/layout";
import { wikipediaSearchUrl, type DictionaryResult } from "../lookup/lookup";
import {
  DEFAULT_DICTIONARY_SETTINGS,
  type DictionarySettings,
} from "./settings";
import {
  isUrlTemplate,
  lookupMerriamWebster,
  lookupUrban,
  lookupWikipediaEntry,
  lookupWiktionaryWithAudio,
  merriamWebsterUrl,
  urbanUrl,
  urlOfTemplate,
} from "./web";
import { useLocalDictionaries, type LocalDictionary } from "./local";
import { lookupMdict } from "./mdict";

export {
  DEFAULT_DICTIONARY_SETTINGS,
  type DictionarySettings,
  type WebSite,
} from "./settings";

/**
 * The dictionaries a word is looked up in, in the order the user puts them:
 * on the web (an API), a link to a site, or a dictionary file imported. The
 * popup of a lookup has a tab for each one turned on.
 */

export type SourceKind = "web" | "link" | "local";

export type DictionarySource = {
  /** e.g. `wiktionary`, `web:<id>` of a site added, `mdict:<id>` of a file */
  id: string;
  label: string;
  kind: SourceKind;
  /** what it is, in the settings */
  description?: string;
  /** look a word up; none for a link: it only opens the site */
  lookup?: (word: string, lang?: string) => Promise<DictionaryResult>;
  /** the page of the word on the web; none for a dictionary file */
  url?: (word: string, lang?: string) => string;
  /** of a dictionary file */
  dict?: LocalDictionary;
  /** a dictionary file not on this device: not synced to it */
  missing?: boolean;
};

const wiktionaryUrl = (word: string) =>
  `https://en.wiktionary.org/wiki/${encodeURIComponent(word.trim().replace(/ /g, "_"))}`;

/** The dictionaries the app has, in their default order. */
export function builtinSources(
  settings: DictionarySettings,
): DictionarySource[] {
  const key = settings.merriamWebsterKey?.trim();
  return [
    {
      id: "wiktionary",
      label: "Wiktionary",
      kind: "web",
      description: "Words of most languages, recordings of some",
      lookup: lookupWiktionaryWithAudio,
      url: wiktionaryUrl,
    },
    {
      id: "wikipedia",
      label: "Wikipedia",
      kind: "web",
      description: "The summary of the article, in the language of the book",
      lookup: lookupWikipediaEntry,
      url: (text, lang) => wikipediaSearchUrl(text, lang),
    },
    {
      id: "urban",
      label: "Urban Dictionary",
      kind: "web",
      description: "English slang",
      lookup: (word) => lookupUrban(word),
      url: urbanUrl,
    },
    {
      id: "merriam-webster",
      label: "Merriam-Webster",
      kind: key ? "web" : "link",
      description: key
        ? "English, with pronunciations, by your API key"
        : "Opens the site; with an API key (dictionaryapi.com), looked up here",
      ...(key
        ? { lookup: (word: string) => lookupMerriamWebster(word, key) }
        : {}),
      url: merriamWebsterUrl,
    },
    {
      id: "google",
      label: "Google",
      kind: "link",
      description: "Opens Google's definition of the word",
      url: (word) =>
        urlOfTemplate("https://www.google.com/search?q=define+%WORD%", word),
    },
  ];
}

/** The most words looked up in the dictionaries: a phrase, a name, a title. */
export const MAX_LOOKUP_WORDS = 6;

/** Text to look up in the dictionaries (Wikipedia one of them): a word or a few. */
export const isLookupText = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words <= MAX_LOOKUP_WORDS;
};

/** The dictionaries turned on when the user has not said. */
export const ON_BY_DEFAULT = new Set(["wiktionary", "wikipedia"]);

/** The id of the source of a dictionary file. */
export const localSourceId = (id: string) => `mdict:${id}`;

export const isEnabled = (settings: DictionarySettings, id: string) =>
  settings.enabled[id] ?? (ON_BY_DEFAULT.has(id) || id.startsWith("mdict:"));

/** The dictionary files of a workspace, as dictionaries; looked up only when here. */
export function localSources(
  ws: string | undefined,
  list: LocalDictionary[],
  here: Record<string, boolean>,
): DictionarySource[] {
  return list.map((dict) => {
    const missing = !ws || !here[dict.id];
    return {
      id: localSourceId(dict.id),
      label: dict.name,
      kind: "local",
      description: missing
        ? "Not on this device: its files are not synced"
        : `MDict, ${formatSize(dict.size)}${dict.synced ? ", synced" : ""}`,
      dict,
      ...(missing
        ? { missing: true }
        : { lookup: (word: string) => lookupMdict(ws, dict, word) }),
    };
  });
}

const hostOf = (url: string) => {
  try {
    return new URL(url.replace(/%(25)?WORD%(25)?/gi, "w")).hostname;
  } catch {
    return url;
  }
};

/** The sites added by the user, as dictionaries. */
export const siteSources = (settings: DictionarySettings): DictionarySource[] =>
  settings.sites
    .filter((site) => isUrlTemplate(site.url))
    .map((site) => ({
      id: site.id,
      label: site.name || hostOf(site.url),
      kind: "link",
      description: site.url,
      url: (word) => urlOfTemplate(site.url, word),
    }));

/** All the dictionaries, in the order of the user; those not ordered yet after, as they come. */
export function orderedSources(
  settings: DictionarySettings,
  local: DictionarySource[] = [],
): DictionarySource[] {
  const all = [...builtinSources(settings), ...siteSources(settings), ...local];
  const at = (id: string) => {
    const i = settings.order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return all
    .map((source, i) => ({ source, i }))
    .sort((a, b) => at(a.source.id) - at(b.source.id) || a.i - b.i)
    .map(({ source }) => source);
}

/** The dictionaries turned on, in order: the tabs of a lookup. */
export const enabledSources = (
  settings: DictionarySettings,
  local: DictionarySource[] = [],
) =>
  orderedSources(settings, local).filter(
    (s) => isEnabled(settings, s.id) && (s.lookup || s.url),
  );

/** The settings with a dictionary moved to a place in the order of all. */
export function moveSource(
  settings: DictionarySettings,
  all: DictionarySource[],
  id: string,
  to: number,
): DictionarySettings {
  const ids = all.map((s) => s.id).filter((i) => i !== id);
  if (ids.length === all.length) return settings;
  ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
  return { ...settings, order: ids };
}

/** The settings with a dictionary turned on or off. */
export const setEnabled = (
  settings: DictionarySettings,
  id: string,
  on: boolean,
): DictionarySettings => ({
  ...settings,
  enabled: { ...settings.enabled, [id]: on },
});

/** The settings with a site added; throws if its url has no place for the word. */
export function addSite(
  settings: DictionarySettings,
  name: string,
  url: string,
): DictionarySettings {
  if (!isUrlTemplate(url))
    throw new Error("The url needs %WORD% where the word goes");
  const id = `web:${crypto.randomUUID()}`;
  return {
    ...settings,
    sites: [...settings.sites, { id, name: name.trim(), url: url.trim() }],
    enabled: { ...settings.enabled, [id]: true },
  };
}

/** The settings without a dictionary: a site, or a file, by its id. */
export const forgetSource = (
  settings: DictionarySettings,
  id: string,
): DictionarySettings => {
  const { [id]: _, ...enabled } = settings.enabled;
  return {
    ...settings,
    sites: settings.sites.filter((s) => s.id !== id),
    order: settings.order.filter((i) => i !== id),
    enabled,
  };
};

/** The dictionary settings, with what a newer app added. */
export const withDictionaryDefaults = (
  settings?: Partial<DictionarySettings>,
): DictionarySettings => ({ ...DEFAULT_DICTIONARY_SETTINGS, ...settings });

/** The dictionary settings, in a component. */
export function useDictionarySettings(): DictionarySettings {
  const settings = useStore((state) => state.dictionarySettings);
  return useMemo(() => withDictionaryDefaults(settings), [settings]);
}

/** All the dictionaries in order, in a component. */
export function useDictionarySources(ws?: string): DictionarySource[] {
  const settings = useDictionarySettings();
  const local = useLocalSources(ws);
  return useMemo(() => orderedSources(settings, local), [settings, local]);
}

/** The workspace the dictionary files (and the vocabulary) are in: none for a folder that is not one. */
export function useDictionaryWorkspace(): string | undefined {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  return dataRoot({ initDir, layout }) ? initDir : undefined;
}

/** The dictionary files of a workspace, loaded, as dictionaries; in a component. */
export function useLocalSources(ws?: string): DictionarySource[] {
  const loadedWs = useLocalDictionaries((state) => state.ws);
  const list = useLocalDictionaries((state) => state.list);
  const here = useLocalDictionaries((state) => state.here);
  useEffect(() => {
    if (ws && loadedWs !== ws) void useLocalDictionaries.getState().load(ws);
  }, [ws, loadedWs]);
  return useMemo(
    () => (ws && loadedWs === ws ? localSources(ws, list, here) : []),
    [ws, loadedWs, list, here],
  );
}

/** The settings with dictionaries put first, e.g. those just imported. */
export function putFirst(
  settings: DictionarySettings,
  all: DictionarySource[],
  ids: string[],
): DictionarySettings {
  const rest = all.map((s) => s.id).filter((id) => !ids.includes(id));
  return { ...settings, order: [...ids, ...rest] };
}
