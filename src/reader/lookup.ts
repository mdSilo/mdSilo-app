import { sanitizeHtml } from 'utils/sanitize';

/**
 * Look up the text selected in a book: in Wiktionary, in Wikipedia, or
 * translated. Public APIs, no key needed; a link to the page on the web is
 * given in any case.
 */

export type Definition = { partOfSpeech: string; definitions: string[] };
export type DictionaryEntry = { language: string; meanings: Definition[] };

export type DictionaryResult = { word: string; entries: DictionaryEntry[]; url: string };
export type WikipediaResult = { title: string; extract: string; url: string; thumbnail?: string };
export type TranslationResult = { text: string; from?: string; to: string; url: string };

/** The language code of a book language, e.g. `en` of `en-US`, `zh` of `zh-Hans`. */
export const baseLanguage = (lang?: string) => (lang || 'en').split(/[-_]/)[0].toLowerCase() || 'en';

async function getJson<T>(url: string): Promise<T | undefined> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

type WiktionaryDefinitions = Record<string, Array<{
  partOfSpeech?: string;
  language?: string;
  definitions?: Array<{ definition?: string }>;
}>>;

/**
 * The definitions of a word in the English Wiktionary, which has the words of
 * most languages; the entries of the book language first.
 */
export async function lookupWiktionary(word: string, lang?: string): Promise<DictionaryResult> {
  const term = word.trim();
  const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/ /g, '_'))}`;
  const data = await getJson<WiktionaryDefinitions>(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}?redirect=true`
  );
  const entries: Array<DictionaryEntry & { code: string }> = [];
  for (const [code, items] of Object.entries(data ?? {})) {
    const meanings = (items ?? [])
      .map((item) => ({
        partOfSpeech: item.partOfSpeech ?? '',
        definitions: (item.definitions ?? [])
          .map((d) => sanitizeHtml(d.definition ?? '').trim())
          .filter(Boolean),
      }))
      .filter((m) => m.definitions.length > 0);
    if (meanings.length) entries.push({ code, language: items?.[0]?.language ?? code, meanings });
  }
  // the language of the book first
  const first = baseLanguage(lang);
  entries.sort((a, b) => Number(b.code === first) - Number(a.code === first));
  return { word: term, entries: entries.map(({ language, meanings }) => ({ language, meanings })), url };
}

type WikipediaSummary = {
  title?: string;
  extract?: string;
  type?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

/** The summary of the Wikipedia article on the text, in the book language. */
export async function lookupWikipedia(text: string, lang?: string): Promise<WikipediaResult | undefined> {
  const code = baseLanguage(lang);
  const title = text.trim().replace(/\s+/g, ' ');
  const data = await getJson<WikipediaSummary>(
    `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`
  );
  if (!data?.extract) return undefined;
  return {
    title: data.title ?? title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page ?? `https://${code}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    ...(data.thumbnail?.source ? { thumbnail: data.thumbnail.source } : {}),
  };
}

/** The link to search the text in Wikipedia, when there is no article. */
export const wikipediaSearchUrl = (text: string, lang?: string) =>
  `https://${baseLanguage(lang)}.wikipedia.org/w/index.php?search=${encodeURIComponent(text.trim())}`;

/** The language to translate to: as set, else of the app. */
export const targetLanguage = (setting?: string) =>
  setting || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en';

/** The page of Google Translate for the text. */
export const translateUrl = (text: string, to: string) =>
  `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(to)}&text=${encodeURIComponent(text)}&op=translate`;

/** The text translated by Google Translate (the endpoint its web widgets use). */
export async function translate(text: string, to: string): Promise<TranslationResult> {
  const url = translateUrl(text, to);
  const data = await getJson<[Array<[string, string]>, unknown, string]>(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`
  );
  const translated = (data?.[0] ?? []).map((part) => part?.[0] ?? '').join('');
  if (!translated) throw new Error('No translation');
  return { text: translated, from: typeof data?.[2] === 'string' ? data[2] : undefined, to, url };
}
