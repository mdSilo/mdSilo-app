import { invoke } from "@tauri-apps/api/core";
import DOMPurify, { type Config } from "dompurify";
import type { MDD, MDX } from "js-mdict";
import type { DictionaryResult, Pronunciation } from "../lookup/lookup";
import { registerAudioResolver } from "./audio";
import {
  dictionaryFile,
  setDictionaryHooks,
  useLocalDictionaries,
  type LocalDictionary,
} from "./local";

/**
 * MDict dictionaries (js-mdict): a file read where its index says, not whole.
 * An entry is HTML of the dictionary: its links to sounds (`sound://`) and
 * other entries (`entry://`), its pictures and style sheets in the .mdd, are
 * marked before it is sanitized, then shown in a shadow root (MdictEntry).
 */

/** A file of the workspace as a Blob to js-mdict: its slices read when asked. */
function rangeFile(path: string, name: string): Blob {
  const read = async (start: number, end: number) => {
    const data = await invoke<ArrayBuffer | Uint8Array | number[]>(
      "read_file_range",
      { filePath: path, start, len: Math.max(0, end - start) },
    );
    return data instanceof ArrayBuffer
      ? data
      : data instanceof Uint8Array
        ? (data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ) as ArrayBuffer)
        : new Uint8Array(data).buffer;
  };
  return {
    name,
    slice: (start = 0, end = start) => ({
      arrayBuffer: () => read(start, end),
    }),
  } as unknown as Blob;
}

export type OpenedDictionary = { mdx: MDX; mdds: MDD[] };

const opened = new Map<string, Promise<OpenedDictionary>>();

/** A dictionary opened (its index read), once; again after it failed. */
export function openDictionary(
  ws: string,
  dict: LocalDictionary,
): Promise<OpenedDictionary> {
  const key = `${ws}\n${dict.id}`;
  let open = opened.get(key);
  if (!open) {
    open = (async () => {
      const { MDX, MDD } = await import("js-mdict");
      const file = (name: string) =>
        rangeFile(dictionaryFile(ws, dict.id, name), name);
      const mdx = await MDX.create(file(dict.files.mdx));
      const mdds = await Promise.all(
        (dict.files.mdd ?? []).map((name) => MDD.create(file(name))),
      );
      return { mdx, mdds };
    })();
    opened.set(key, open);
    open.catch(() => opened.delete(key));
  }
  return open;
}

/** Forget a dictionary opened: removed, or imported again. */
export function forgetOpened(id: string) {
  for (const key of opened.keys())
    if (key.endsWith(`\n${id}`)) opened.delete(key);
}

/** The title a dictionary gives itself, if it is one (not the placeholder of MdxBuilder). */
export function titleOf(header: Record<string, unknown>): string | undefined {
  const title = String(header.Title ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (!title || /^title\b.*no html/i.test(title)) return undefined;
  return title.slice(0, 80);
}

// checked when imported: it can be read; its title
setDictionaryHooks({
  check: async (ws, dict) => {
    const { mdx } = await openDictionary(ws, dict);
    const meta = (mdx as unknown as { meta?: { encrypt?: number } }).meta;
    // the entries encrypted (with a key of the user): not readable here
    if (meta?.encrypt && meta.encrypt & 1)
      throw new Error("Encrypted: it needs a registration key");
    return titleOf(mdx.header as Record<string, unknown>);
  },
  forget: forgetOpened,
});

// ------------------------------------------------------------------- lookup

const LINK = /^@@@LINK=\s*(.+?)\s*$/m;

/** The entry of a word: its HTML, the links (`@@@LINK=other`) followed. */
export async function followLinks(mdx: Pick<MDX, "lookup">, word: string) {
  let target = word;
  for (let hops = 0; hops < 4; hops++) {
    const res = await mdx.lookup(target);
    // the records end with a NUL, some
    const html = res?.definition?.replace(/\0+$/, "");
    if (!html?.trim()) return undefined;
    const link = LINK.exec(html.trim());
    if (!link || html.trim().split("\n").length > 1) return html;
    target = link[1];
  }
  return undefined;
}

/** Look a word up in a dictionary file: as written, else in lower case. */
export async function lookupMdict(
  ws: string,
  dict: LocalDictionary,
  word: string,
): Promise<DictionaryResult> {
  const term = word.trim();
  const { mdx } = await openDictionary(ws, dict);
  let html: string | undefined;
  for (const w of new Set([term, term.toLowerCase()])) {
    html = await followLinks(mdx, w);
    if (html) break;
  }
  if (!html) return { word: term, entries: [], url: "" };
  const prepared = prepareEntry(html, dict.id);
  return {
    word: term,
    entries: [],
    url: "",
    html: prepared.html,
    ...(prepared.pronunciations.length
      ? { pronunciations: prepared.pronunciations }
      : {}),
    ...(prepared.styles.length ? { styles: prepared.styles } : {}),
  };
}

// --------------------------------------------------------------------- HTML

/*
  The HTML of a dictionary, shown in a shadow root: its styles and classes
  kept (they do not reach the app), not its scripts, forms or frames.
*/
const MDICT_HTML: Config = {
  FORBID_TAGS: [
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
  ],
  ADD_TAGS: ["style"],
  ALLOW_DATA_ATTR: true,
};

const SOUND = /^sound:\/\//i;
const ENTRY = /^(?:entry|bword):\/\//i;
// a scheme (http:, data:, blob:…) or //host: not a file of the .mdd
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
// the player of Vocabulary.com's dictionaries: onclick="v0r.v(this,'KEY')"
const V0R = /v0r\.v\s*\(\s*this\s*,\s*['"]([^'"]+)['"]\s*\)/i;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** A recording of a dictionary file, as played: `mdict:<id>:<path in the .mdd>`. */
export const mdictAudioRef = (id: string, path: string) =>
  `mdict:${id}:${path}`;

/**
 * An entry, to show: its links to sounds, entries and anchors, its pictures
 * and style sheets marked (`data-mdict-*`), then sanitized; the sounds as
 * pronunciations; the style sheets of the .mdd it links to.
 */
export function prepareEntry(
  html: string,
  id: string,
): { html: string; pronunciations: Pronunciation[]; styles: string[] } {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${html}`,
    "text/html",
  );
  const sounds: string[] = [];
  const styles: string[] = [];
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const href = link.getAttribute("href") ?? "";
    if (href && !EXTERNAL.test(href)) styles.push(href);
    link.remove();
  }
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (SOUND.test(href)) {
      const path = decode(href.replace(SOUND, ""));
      a.setAttribute("data-mdict-sound", path);
      a.setAttribute("href", "#");
      sounds.push(path);
    } else if (ENTRY.test(href)) {
      const target = decode(href.replace(ENTRY, ""));
      if (target.startsWith("#"))
        a.setAttribute("data-mdict-anchor", target.slice(1));
      else a.setAttribute("data-mdict-entry", target);
      a.setAttribute("href", "#");
    } else if (href.startsWith("#")) {
      a.setAttribute("data-mdict-anchor", href.slice(1));
    }
  }
  for (const el of doc.querySelectorAll("[onclick]")) {
    const key = V0R.exec(el.getAttribute("onclick") ?? "")?.[1]?.trim();
    if (key) {
      el.setAttribute("data-mdict-sound", key);
      sounds.push(key);
    }
  }
  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (!src || EXTERNAL.test(src)) continue;
    img.setAttribute("data-mdict-src", src);
    img.removeAttribute("src");
  }
  const clean = DOMPurify.sanitize(doc.body.innerHTML, MDICT_HTML);
  return {
    html: clean,
    pronunciations: [...new Set(sounds)]
      .slice(0, 3)
      .map((path) => ({ audio: mdictAudioRef(id, path) })),
    styles,
  };
}

// -------------------------------------------------------------- resources

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  webm: "audio/webm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  css: "text/css",
};
const AUDIO_EXTS = ["mp3", "m4a", "aac", "ogg", "opus", "wav", "spx"];

/** The type of a file by its name: a web view plays a sound only with its type. */
export const mimeOf = (path: string) =>
  MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "";

/** The bytes of a file in the .mdd of a dictionary, as written or without a leading `/`. */
export async function resourceOf(
  mdds: MDD[],
  path: string,
): Promise<Uint8Array | undefined> {
  const keys = path.startsWith("/") ? [path, path.slice(1)] : [path];
  for (const mdd of mdds) {
    for (const key of keys) {
      try {
        const found = await mdd.locateBytes(key);
        if (found?.data) return found.data;
      } catch (e) {
        console.warn("Failed to read from the .mdd", key, e);
      }
    }
  }
  return undefined;
}

/** A blob url of a file in the .mdd, with its type. */
export async function resourceUrl(
  mdds: MDD[],
  path: string,
): Promise<string | undefined> {
  const data = await resourceOf(mdds, path);
  if (!data) return undefined;
  return URL.createObjectURL(
    new Blob([new Uint8Array(data)], { type: mimeOf(path) }),
  );
}

/** The dictionary of an id, in the workspace loaded. */
const dictOf = (id: string) => {
  const { ws, list } = useLocalDictionaries.getState();
  const dict = list.find((d) => d.id === id);
  return ws && dict ? { ws, dict } : undefined;
};

// the recordings of the dictionaries, read when played; kept, they are small
const audioUrls = new Map<string, string>();

registerAudioResolver("mdict:", async (ref) => {
  const known = audioUrls.get(ref);
  if (known) return known;
  const [, id, ...rest] = ref.split(":");
  const path = rest.join(":");
  const found = dictOf(id);
  if (!found || !path) return undefined;
  const { mdds } = await openDictionary(found.ws, found.dict);
  // a sound by its key (no extension): as the dictionaries name them
  const paths = /\.[a-z0-9]{2,4}$/i.test(path)
    ? [path]
    : AUDIO_EXTS.flatMap((ext) => [`${path}.${ext}`, `audio/${path}.${ext}`]);
  for (const p of paths) {
    const url = await resourceUrl(mdds, p);
    if (url) {
      audioUrls.set(ref, url);
      return url;
    }
  }
  return undefined;
});
