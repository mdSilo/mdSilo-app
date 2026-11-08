import { invoke } from "@tauri-apps/api/core";
import { md5 } from "js-md5";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  baseLanguage,
  lookupWikipedia,
  lookupWiktionary,
  wikipediaSearchUrl,
  type DictionaryEntry,
  type DictionaryResult,
  type Pronunciation,
} from "../lookup/lookup";

/**
 * The dictionaries on the web: looked up by their public APIs, or, for a
 * site with no API (or none without a key), a link to its page of the word.
 */

async function getJson<T>(url: string): Promise<T | undefined> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** JSON of a site that does not allow the app to fetch it (no CORS): by the app host. */
async function getJsonByHost<T>(url: string): Promise<T> {
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>("fetch_url", {
    url,
  });
  const bytes =
    data instanceof Uint8Array
      ? data
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** The label of a recording from its file or url, e.g. UK of `cold-uk.mp3`, `En-uk-cold.ogg`. */
export function accentOf(name: string): string | undefined {
  const file = decodeURIComponent(name.split("/").pop() ?? "").toLowerCase();
  const m = /(?:^|[-_(])(uk|us|au|ca|nz|ie|in|za|gb)(?=[-_.)])/.exec(file);
  return m ? m[1].replace("gb", "uk").toUpperCase() : undefined;
}

// ---------------------------------------------------------------- Wiktionary

type MediaList = {
  items?: Array<{ title?: string; type?: string }>;
};

/**
 * The url of a file of Wikimedia Commons, as mp3: Commons keeps recordings
 * as .ogg/.wav, which not every web view plays; it has each as mp3 too.
 */
export function commonsAudioUrl(title: string): string {
  // a title is as linked; the name of the file has its first letter in capital
  const linked = title.replace(/^File:/i, "").replace(/ /g, "_");
  const name = linked.charAt(0).toUpperCase() + linked.slice(1);
  const hash = md5(name);
  const path = `${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(name)}`;
  return /\.mp3$/i.test(name)
    ? `https://upload.wikimedia.org/wikipedia/commons/${path}`
    : `https://upload.wikimedia.org/wikipedia/commons/transcoded/${path}/${encodeURIComponent(name)}.mp3`;
}

/**
 * The recordings of a word on its Wiktionary page: of the language given
 * first (their files are named so, e.g. En-us-cold.ogg); a few.
 */
export async function wiktionaryRecordings(
  word: string,
  lang?: string,
): Promise<Pronunciation[]> {
  const data = await getJson<MediaList>(
    `https://en.wiktionary.org/api/rest_v1/page/media-list/${encodeURIComponent(word.trim().replace(/ /g, "_"))}?redirect=true`,
  ).catch(() => undefined);
  const titles = (data?.items ?? [])
    .filter((item) => item.type === "audio" && item.title)
    .map((item) => item.title!);
  const code = baseLanguage(lang);
  const ofLanguage = titles.filter((t) =>
    t
      .replace(/^File:/, "")
      .toLowerCase()
      .startsWith(`${code}-`),
  );
  return (ofLanguage.length ? ofLanguage : titles).slice(0, 3).map((t) => {
    const label = accentOf(t);
    return { audio: commonsAudioUrl(t), ...(label ? { label } : {}) };
  });
}

/** A word capitalized, as at the start of a sentence: `Rabbit`, not `NASA` or `rabbit`. */
const capitalized = (word: string) =>
  word !== word.toLowerCase() && word.slice(1) === word.slice(1).toLowerCase();

/**
 * Wiktionary, with the recordings of the word put to its first entry. A word
 * capitalized is looked up as written and in lower case too: `Rabbit` has
 * only the name; the entries of a language put together, as written first.
 */
export async function lookupWiktionaryWithAudio(
  word: string,
  lang?: string,
): Promise<DictionaryResult> {
  const term = word.trim();
  const lower = capitalized(term) ? term.toLowerCase() : undefined;
  const [result, recordings, lowered, lowerRecordings] = await Promise.all([
    lookupWiktionary(term, lang),
    wiktionaryRecordings(term, lang),
    lower ? lookupWiktionary(lower, lang).catch(() => undefined) : undefined,
    lower ? wiktionaryRecordings(lower, lang) : [],
  ]);
  for (const entry of lowered?.entries ?? []) {
    const same = result.entries.find((e) => e.language === entry.language);
    if (same) same.meanings = [...same.meanings, ...entry.meanings];
    else result.entries.push(entry);
  }
  const audio = recordings.length ? recordings : lowerRecordings;
  if (result.entries.length && audio.length)
    result.entries[0] = { ...result.entries[0], pronunciations: audio };
  return result;
}

// ----------------------------------------------------------------- Wikipedia

/**
 * The summary of the Wikipedia article on the text, in the book language, as
 * an entry of a dictionary: none if there is no article (its search then).
 */
export async function lookupWikipediaEntry(
  text: string,
  lang?: string,
): Promise<DictionaryResult> {
  const term = text.trim().replace(/\s+/g, " ");
  const summary = await lookupWikipedia(term, lang);
  if (!summary)
    return { word: term, entries: [], url: wikipediaSearchUrl(term, lang) };
  return {
    word: summary.title,
    entries: [
      {
        language: "Wikipedia",
        meanings: [
          { partOfSpeech: "", definitions: [escape(summary.extract)] },
        ],
      },
    ],
    url: summary.url,
  };
}

// ---------------------------------------------------------- Urban Dictionary

type UrbanDefinition = {
  word?: string;
  definition?: string;
  example?: string;
  thumbs_up?: number;
  sound_urls?: string[];
};

/** Urban Dictionary text: its [links] to other words as plain words, line breaks kept. */
const urbanText = (text: string) =>
  escape(text.replace(/\[([^\]]*)\]/g, "$1").trim()).replace(/\r?\n+/g, "<br>");

export const urbanUrl = (word: string) =>
  `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(word.trim())}`;

/** Urban Dictionary: slang, the definitions most voted for first. */
export async function lookupUrban(word: string): Promise<DictionaryResult> {
  const term = word.trim();
  const data = await getJsonByHost<{ list?: UrbanDefinition[] }>(
    `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
  );
  const list = (data.list ?? [])
    .filter((d) => d.definition?.trim())
    .sort((a, b) => (b.thumbs_up ?? 0) - (a.thumbs_up ?? 0))
    .slice(0, 4);
  const sounds = list.flatMap((d) => d.sound_urls ?? []).slice(0, 2);
  const entries: DictionaryEntry[] = list.length
    ? [
        {
          language: "Slang",
          meanings: [
            {
              partOfSpeech: "",
              definitions: list.map((d) =>
                sanitizeHtml(
                  `${urbanText(d.definition ?? "")}${d.example?.trim() ? `<br><i>${urbanText(d.example)}</i>` : ""}`,
                ),
              ),
            },
          ],
          ...(sounds.length
            ? { pronunciations: sounds.map((audio) => ({ audio })) }
            : {}),
        },
      ]
    : [];
  return { word: term, entries, url: urbanUrl(term) };
}

// ----------------------------------------------------------- Merriam-Webster

type MerriamWebsterEntry = {
  meta?: { id?: string };
  hwi?: {
    hw?: string;
    prs?: Array<{ mw?: string; sound?: { audio?: string } }>;
  };
  fl?: string;
  shortdef?: string[];
};

export const merriamWebsterUrl = (word: string) =>
  `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word.trim())}`;

/** The url of a recording of Merriam-Webster, by the name its API gives. */
export function merriamWebsterAudioUrl(audio: string): string {
  const subdir = audio.startsWith("bix")
    ? "bix"
    : audio.startsWith("gg")
      ? "gg"
      : /^[^a-z]/i.test(audio)
        ? "number"
        : audio[0];
  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subdir}/${encodeURIComponent(audio)}.mp3`;
}

/**
 * Merriam-Webster's Collegiate Dictionary, by its API: needs a key of the
 * user (free for non-commercial use, dictionaryapi.com).
 */
export async function lookupMerriamWebster(
  word: string,
  key: string,
): Promise<DictionaryResult> {
  const term = word.trim();
  const data = await getJsonByHost<Array<MerriamWebsterEntry | string>>(
    `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(term)}?key=${encodeURIComponent(key)}`,
  );
  // a word not found gives the words like it, as strings
  const found = (Array.isArray(data) ? data : []).filter(
    (e): e is MerriamWebsterEntry => typeof e === "object" && e !== null,
  );
  // the homographs of the word (cold:1, cold:2), not the phrases with it
  const headword = (e: MerriamWebsterEntry) =>
    (e.meta?.id ?? "").split(":")[0].toLowerCase();
  const first = found[0] ? headword(found[0]) : "";
  const meanings: DictionaryEntry["meanings"] = [];
  let pronunciations: Pronunciation[] = [];
  for (const entry of found.filter((e) => headword(e) === first)) {
    const defs = (entry.shortdef ?? []).filter(Boolean).map(escape);
    if (!defs.length) continue;
    meanings.push({ partOfSpeech: entry.fl ?? "", definitions: defs });
    if (pronunciations.length) continue;
    pronunciations = (entry.hwi?.prs ?? [])
      .filter((p) => p.mw || p.sound?.audio)
      .slice(0, 2)
      .map((p) => ({
        ...(p.mw ? { text: `\\${p.mw}\\` } : {}),
        ...(p.sound?.audio
          ? { audio: merriamWebsterAudioUrl(p.sound.audio), label: "US" }
          : {}),
      }));
  }
  const entries: DictionaryEntry[] = meanings.length
    ? [
        {
          language: "English",
          meanings,
          ...(pronunciations.length ? { pronunciations } : {}),
        },
      ]
    : [];
  return { word: term, entries, url: merriamWebsterUrl(term) };
}

// --------------------------------------------------------------------- links

/**
 * The url of a site for a word, from a template with `%WORD%` where the word
 * goes (case aside; also `%25WORD%25`, as a url pasted encoded has it).
 */
export const urlOfTemplate = (template: string, word: string) => {
  const encoded = encodeURIComponent(word.trim());
  return template.replace(/%25WORD%25/gi, encoded).replace(/%WORD%/gi, encoded);
};

/** A template the app can use: a web url with a place for the word. */
export const isUrlTemplate = (template: string) =>
  /^https?:\/\/\S+$/i.test(template.trim()) &&
  /%(25)?WORD%(25)?/i.test(template);
