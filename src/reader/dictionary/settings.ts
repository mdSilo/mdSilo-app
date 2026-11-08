/**
 * The dictionary settings, kept with the user settings (this device); no
 * imports, the store uses it. See dictionary.ts.
 */

/** A site added by the user: its page of a word, from a url template; looked up in the app with a key. */
export type WebSite = {
  id: string;
  name: string;
  url: string;
  /** the API key of the user, put where the url has `%KEY%`; kept here, not in the url */
  key?: string;
};

export type DictionarySettings = {
  /** the ids of the dictionaries, in the order of the tabs; others go after */
  order: string[];
  /** turned on or off; else as `ON_BY_DEFAULT` says */
  enabled: Record<string, boolean>;
  /** the sites added by the user */
  sites: WebSite[];
  /** the key of the user for the API of Merriam-Webster */
  merriamWebsterKey?: string;
};

export const DEFAULT_DICTIONARY_SETTINGS: DictionarySettings = {
  order: [],
  enabled: {},
  sites: [],
};
