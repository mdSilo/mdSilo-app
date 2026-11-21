import { store } from "@/state/store";
import { fromWorkspacePath, joinPath, toWorkspacePath } from "@/workspace/util";
import { localRoot } from "@/workspace/layout";
import { readBytes, writeBytes } from "@/reader/library/library";
import { noteContent } from "@/lib/contentCache";
import { encodeHref } from "@/lib/mdlink";
import { aiProviders, type AiProvider } from "./providers";
import { fetchJson } from "./transport";
import { withUsage } from "./usage";
import { markdownParagraphs, type Chunk } from "./chat/context";
import { isExcludedNote, isExcludedPath } from "./chat/privacy";
import { isOwnNote } from "./myself";

/**
 * Search by meaning (docs/ai.md, "Retrieval", v2; opt-in): a vector of each
 * paragraph of the user's own notes, by the embedding model of a provider
 * (`/embeddings`, OpenAI-compatible), kept on this device only
 * (`.mdsilo/local/ai-embeddings.bin`, never synced), updated by the notes
 * changed. Searched with the words of the index (hybrid), and to suggest
 * links between notes on the same ideas.
 */

export const INDEX_FILE = "ai-embeddings.bin";
/** a paragraph shorter than this says too little to be found by */
const MIN_CHARS = 20;
/** of a paragraph, embedded at most */
const MAX_CHARS = 2_000;
/** texts sent at once */
const BATCH = 64;
/** paragraphs indexed at most, of all the notes */
export const MAX_PARAGRAPHS = 50_000;

type NoteVectors = {
  /** `updated_at` of the note when its paragraphs were embedded */
  updated: string;
  /** the index of each vector's paragraph among the paragraphs of the note */
  paras: number[];
  /** dims bytes a paragraph */
  vectors: Int8Array;
  norms: Float32Array;
};

export type EmbeddingIndex = {
  model: string;
  dims: number;
  /** by the path of the note, relative to the workspace */
  notes: Map<string, NoteVectors>;
};

/** The provider of embeddings: the first with a model for them. */
export async function embeddingProvider(): Promise<AiProvider | undefined> {
  return (await aiProviders()).find(
    (p) => p.kind === "openai" && p.settings?.embedModel?.trim(),
  );
}

/** A vector as bytes: each value of -1..1 over its largest, times 127. Cosine needs no scale. */
export function quantize(vector: ArrayLike<number>): Int8Array {
  let max = 0;
  for (let i = 0; i < vector.length; i++)
    max = Math.max(max, Math.abs(vector[i]));
  const out = new Int8Array(vector.length);
  if (!max) return out;
  for (let i = 0; i < vector.length; i++)
    out[i] = Math.round((vector[i] / max) * 127);
  return out;
}

const normOf = (v: ArrayLike<number>, from = 0, dims = v.length) => {
  let sum = 0;
  for (let i = from; i < from + dims; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
};

// # the file: a JSON header (its length first, 4 bytes), then the vectors

export function encodeIndex(index: EmbeddingIndex): Uint8Array {
  const notes = [...index.notes.entries()].map(([path, n]) => ({
    path,
    updated: n.updated,
    paras: n.paras,
  }));
  const header = new TextEncoder().encode(
    JSON.stringify({ version: 1, model: index.model, dims: index.dims, notes }),
  );
  const total = [...index.notes.values()].reduce(
    (s, n) => s + n.vectors.length,
    0,
  );
  const out = new Uint8Array(4 + header.length + total);
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  let at = 4 + header.length;
  for (const n of index.notes.values()) {
    out.set(
      new Uint8Array(n.vectors.buffer, n.vectors.byteOffset, n.vectors.length),
      at,
    );
    at += n.vectors.length;
  }
  return out;
}

export function decodeIndex(bytes: Uint8Array): EmbeddingIndex | null {
  try {
    const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(
      0,
      true,
    );
    const header = JSON.parse(
      new TextDecoder().decode(bytes.subarray(4, 4 + length)),
    ) as {
      version: number;
      model: string;
      dims: number;
      notes: { path: string; updated: string; paras: number[] }[];
    };
    if (header.version !== 1 || !header.dims) return null;
    const notes = new Map<string, NoteVectors>();
    let at = 4 + length;
    for (const n of header.notes) {
      const size = n.paras.length * header.dims;
      const vectors = new Int8Array(bytes.slice(at, at + size).buffer);
      at += size;
      const norms = new Float32Array(n.paras.length);
      for (let i = 0; i < n.paras.length; i++)
        norms[i] = normOf(vectors, i * header.dims, header.dims);
      notes.set(n.path, { updated: n.updated, paras: n.paras, vectors, norms });
    }
    return { model: header.model, dims: header.dims, notes };
  } catch {
    return null;
  }
}

// # kept and loaded

let loaded: { ws: string; index: EmbeddingIndex | null } | undefined;

const indexPath = () => {
  const local = localRoot();
  return local ? joinPath(local, INDEX_FILE) : undefined;
};

/** The index of the workspace, read once; none if not made. */
export async function loadIndex(): Promise<EmbeddingIndex | null> {
  const ws = store.getState().initDir ?? "";
  if (loaded?.ws === ws) return loaded.index;
  const path = indexPath();
  let index: EmbeddingIndex | null = null;
  if (path) {
    try {
      index = decodeIndex(await readBytes(path));
    } catch {
      index = null;
    }
  }
  loaded = { ws, index };
  return index;
}

async function saveIndex(index: EmbeddingIndex) {
  const path = indexPath();
  if (!path) throw new Error("Open a workspace to keep the index in.");
  if (!(await writeBytes(path, encodeIndex(index))))
    throw new Error("The index could not be written.");
  loaded = { ws: store.getState().initDir ?? "", index };
}

/** Forget the index, on this device. */
export async function deleteIndex() {
  const path = indexPath();
  loaded = { ws: store.getState().initDir ?? "", index: null };
  if (path) await writeBytes(path, new Uint8Array());
}

/** For tests: read the index again */
export const forgetLoadedIndex = () => {
  loaded = undefined;
};

// # embedding

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The vectors of the texts, in their order. */
export async function embed(
  provider: AiProvider,
  texts: string[],
): Promise<number[][]> {
  const answer: any = await fetchJson(provider.id, "POST", "/embeddings", {
    model: provider.settings.embedModel?.trim(),
    input: texts,
  });
  const data: any[] = Array.isArray(answer?.data) ? answer.data : [];
  if (data.length !== texts.length)
    throw new Error("The provider gave no vectors.");
  const tokens = Number(
    answer?.usage?.prompt_tokens ?? answer?.usage?.total_tokens ?? 0,
  );
  if (tokens) {
    const { aiSettings, setAiSettings } = store.getState();
    setAiSettings(withUsage(aiSettings, provider.id, tokens, 0));
  }
  return [...data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding as number[]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The paragraphs of a note to embed: with their index, the title before them. */
function paragraphsToEmbed(title: string, content: string) {
  return markdownParagraphs(content)
    .map((text, i) => ({ i, text }))
    .filter((p) => p.text.length >= MIN_CHARS)
    .map((p) => ({ i: p.i, text: `${title}\n${p.text.slice(0, MAX_CHARS)}` }));
}

/** The notes the index is of: the user's own, not excluded by their folder. */
const indexedNotes = () =>
  [...store.getState().notes.values()].filter(isOwnNote);

/** What is left to embed: notes new or changed since, and their characters. */
export async function pendingOf(index: EmbeddingIndex | null) {
  const ws = store.getState().initDir;
  let notes = 0;
  let chars = 0;
  if (!ws) return { notes, chars };
  for (const note of indexedNotes()) {
    const kept = index?.notes.get(toWorkspacePath(ws, note.id));
    if (kept?.updated === note.updated_at) continue;
    notes++;
    chars += (await noteContent(note.id)).length;
  }
  return { notes, chars };
}

/**
 * Bring the index up to date: the notes new or changed embedded, the gone
 * ones taken out; a new index if the model changed. Kept every few notes,
 * not to lose it all if stopped.
 */
export async function updateIndex(
  options: {
    onProgress?: (done: number, of: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ embedded: number; removed: number }> {
  const ws = store.getState().initDir;
  if (!ws) throw new Error("Open a workspace first.");
  const provider = await embeddingProvider();
  if (!provider)
    throw new Error(
      "No embeddings model: set one for a provider in Settings > AI.",
    );
  const model = provider.settings.embedModel!.trim();
  let index = await loadIndex();
  if (!index || index.model !== model)
    index = { model, dims: 0, notes: new Map() };
  const notes = indexedNotes();
  const present = new Set(notes.map((n) => toWorkspacePath(ws, n.id)));
  let removed = 0;
  for (const path of [...index.notes.keys()])
    if (!present.has(path)) {
      index.notes.delete(path);
      removed++;
    }
  const todo = notes.filter(
    (n) =>
      index!.notes.get(toWorkspacePath(ws, n.id))?.updated !== n.updated_at,
  );
  let total = [...index.notes.values()].reduce((s, n) => s + n.paras.length, 0);
  let embedded = 0;
  for (const [k, note] of todo.entries()) {
    if (options.signal?.aborted) break;
    options.onProgress?.(k, todo.length);
    const path = toWorkspacePath(ws, note.id);
    const content = await noteContent(note.id);
    index.notes.delete(path);
    if (isExcludedNote(note.id, content)) continue;
    const paras = paragraphsToEmbed(note.title, content);
    if (total + paras.length > MAX_PARAGRAPHS) break;
    const vectors: Int8Array[] = [];
    for (let b = 0; b < paras.length; b += BATCH) {
      const got = await embed(
        provider,
        paras.slice(b, b + BATCH).map((p) => p.text),
      );
      for (const v of got) vectors.push(quantize(v));
    }
    const dims = vectors[0]?.length ?? index.dims;
    if (index.dims && dims !== index.dims)
      throw new Error(
        "The vectors changed size: delete the index and build it again.",
      );
    index.dims = dims;
    const flat = new Int8Array(vectors.length * dims);
    vectors.forEach((v, i) => flat.set(v, i * dims));
    const norms = new Float32Array(vectors.map((v) => normOf(v)));
    index.notes.set(path, {
      updated: note.updated_at,
      paras: paras.map((p) => p.i),
      vectors: flat,
      norms,
    });
    total += paras.length;
    embedded++;
    if (embedded % 20 === 0) await saveIndex(index);
  }
  if (embedded || removed) await saveIndex(index);
  options.onProgress?.(todo.length, todo.length);
  return { embedded, removed };
}

// # searching

export type Similar = { path: string; para: number; score: number };

/** The paragraphs nearest to a vector, of all the notes but those `skip` says. */
export function nearest(
  index: EmbeddingIndex,
  query: Int8Array,
  limit: number,
  skip: (path: string) => boolean = () => false,
): Similar[] {
  const qNorm = normOf(query) || 1;
  const found: Similar[] = [];
  const { dims } = index;
  for (const [path, n] of index.notes) {
    if (skip(path)) continue;
    for (let p = 0; p < n.paras.length; p++) {
      let dot = 0;
      const at = p * dims;
      for (let d = 0; d < dims; d++) dot += query[d] * n.vectors[at + d];
      const score = dot / (qNorm * (n.norms[p] || 1));
      found.push({ path, para: n.paras[p], score });
    }
  }
  return found.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The text of a paragraph found, if its note is as when embedded; none if not to be read. */
async function chunkOf(ws: string, s: Similar): Promise<Chunk | undefined> {
  const id = fromWorkspacePath(ws, s.path);
  const note = store.getState().notes.get(id);
  if (!note) return undefined;
  const content = await noteContent(id);
  if (isExcludedNote(id, content)) return undefined;
  const text = markdownParagraphs(content)[s.para];
  return text ? { text, href: encodeHref(note.title) } : undefined;
}

/**
 * The paragraphs nearest in meaning to the query, of a folder (an absolute
 * path) or all the notes; none if search by meaning is off or not made.
 */
export async function semanticSearch(
  query: string,
  options: { dir?: string; limit?: number } = {},
): Promise<{ chunk: Chunk; score: number }[]> {
  const ws = store.getState().initDir;
  if (!ws || !store.getState().aiSettings.embeddings) return [];
  const index = await loadIndex();
  if (!index?.notes.size) return [];
  const provider = await embeddingProvider();
  if (!provider || provider.settings.embedModel?.trim() !== index.model)
    return [];
  const [vector] = await embed(provider, [query]);
  const prefix = options.dir
    ? `${toWorkspacePath(ws, options.dir).replace(/\/+$/, "")}/`
    : "";
  const found = nearest(
    index,
    quantize(vector),
    options.limit ?? 30,
    (path) =>
      (prefix && !path.startsWith(prefix)) ||
      isExcludedPath(fromWorkspacePath(ws, path)),
  );
  const out: { chunk: Chunk; score: number }[] = [];
  for (const s of found) {
    const chunk = await chunkOf(ws, s);
    if (chunk) out.push({ chunk, score: s.score });
  }
  return out;
}

/** Merge ranked lists, by reciprocal rank: what is high in either comes first. */
export function fuseRanks(lists: Chunk[][], k = 60): Chunk[] {
  const scores = new Map<string, { chunk: Chunk; score: number }>();
  for (const list of lists)
    list.forEach((chunk, rank) => {
      const key = `${chunk.href}\u0000${chunk.text}`;
      const kept = scores.get(key) ?? { chunk, score: 0 };
      kept.score += 1 / (k + rank + 1);
      scores.set(key, kept);
    });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((s) => s.chunk);
}

/**
 * Notes on the same ideas as a note, by its paragraphs' vectors (no request
 * to the provider): each with its best score and the passage that matched.
 */
export async function similarNotes(
  noteId: string,
  options: { limit?: number; minScore?: number; skip?: Set<string> } = {},
): Promise<{ id: string; title: string; score: number; passage: string }[]> {
  const ws = store.getState().initDir;
  if (!ws) return [];
  const index = await loadIndex();
  const self = index?.notes.get(toWorkspacePath(ws, noteId));
  if (!index || !self || !self.paras.length) return [];
  const best = new Map<string, Similar>();
  const selfPath = toWorkspacePath(ws, noteId);
  for (let p = 0; p < self.paras.length; p++) {
    const query = self.vectors.subarray(p * index.dims, (p + 1) * index.dims);
    for (const s of nearest(
      index,
      query,
      8,
      (path) =>
        path === selfPath ||
        isExcludedPath(fromWorkspacePath(ws, path)) ||
        Boolean(options.skip?.has(fromWorkspacePath(ws, path))),
    ))
      if ((best.get(s.path)?.score ?? -1) < s.score) best.set(s.path, s);
  }
  const top = [...best.values()]
    .filter((s) => s.score >= (options.minScore ?? 0.5))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 5);
  const out = [];
  for (const s of top) {
    const id = fromWorkspacePath(ws, s.path);
    const note = store.getState().notes.get(id);
    const chunk = await chunkOf(ws, s);
    if (note && chunk)
      out.push({ id, title: note.title, score: s.score, passage: chunk.text });
  }
  return out;
}
