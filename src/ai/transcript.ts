import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { joinPaths } from "@/workspace/util";
import { openFilePaths } from "@/workspace/open";
import { writeFile } from "@/workspace/write";
import { readingRoot } from "@/workspace/layout";
import { noteContent } from "@/lib/contentCache";
import { clipFileName } from "@/feed/clip";
import { usePlayer } from "@/player/playerStore";
import type { PodType } from "@/types/model";
import { transcribe, type Segment } from "./stt";

/**
 * The transcript of a podcast (docs/ai.md, "Speech to text"): a note in
 * `transcripts/`, its paragraphs each starting with a link to their time in
 * the episode (`podcast:<audio>#t=<seconds>`), which plays it from there; so
 * it can be read, searched, quoted and asked about like any note, and shown
 * beside the player, following it.
 */

export const TRANSCRIPTS_DIR = "transcripts";

/** a paragraph of a transcript: about so many seconds, or characters */
const PARAGRAPH_SECONDS = 45;
const PARAGRAPH_CHARS = 600;

/** A time as the player shows it: m:ss, or h:mm:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A link to a time of a podcast, to put in notes. */
export const podcastHref = (audio: string, seconds: number) =>
  `podcast:${encodeURIComponent(audio)}#t=${Math.floor(seconds)}`;

export function parsePodcastHref(
  href: string,
): { audio: string; seconds: number } | undefined {
  const m = /^podcast:([^#\s]+)(?:#t=(\d+(?:\.\d+)?))?$/.exec(href.trim());
  if (!m) return undefined;
  try {
    return { audio: decodeURIComponent(m[1]), seconds: Number(m[2] ?? 0) };
  } catch {
    return undefined;
  }
}

/** The segments as paragraphs, each with the time it starts at. */
export function paragraphsOf(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (
      last &&
      seg.start - last.start < PARAGRAPH_SECONDS &&
      last.text.length + seg.text.length < PARAGRAPH_CHARS
    ) {
      last.text = `${last.text} ${seg.text}`;
      last.end = seg.end;
    } else out.push({ ...seg });
  }
  return out;
}

/** The Markdown of a transcript. */
export function transcriptMarkdown(pod: PodType, segments: Segment[]): string {
  const front = [
    "---",
    `title: ${JSON.stringify(pod.title)}`,
    `audio: ${JSON.stringify(pod.url)}`,
    ...(pod.article_url ? [`article: ${JSON.stringify(pod.article_url)}`] : []),
    ...(pod.feed_link ? [`feed: ${JSON.stringify(pod.feed_link)}`] : []),
    `transcribed: ${new Date().toISOString()}`,
    "---",
  ].join("\n");
  const body = paragraphsOf(segments)
    .map(
      (p) => `[${clock(p.start)}](${podcastHref(pod.url, p.start)}) ${p.text}`,
    )
    .join("\n\n");
  return `${front}\n\n# ${pod.title}\n\n${body}\n`;
}

/** The paragraphs of a transcript note, with their times. */
export function parseTranscript(markdown: string): {
  audio?: string;
  title?: string;
  article?: string;
  feed?: string;
  paragraphs: Segment[];
} {
  const meta: Record<string, string> = {};
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (front)
    for (const line of front[1].split(/\r?\n/)) {
      const m = /^(\w+):\s*(.*)$/.exec(line);
      if (!m) continue;
      try {
        meta[m[1]] = m[2].startsWith('"') ? (JSON.parse(m[2]) as string) : m[2];
      } catch {
        meta[m[1]] = m[2];
      }
    }
  const paragraphs: Segment[] = [];
  for (const m of markdown.matchAll(
    /^\[[\d:]+\]\((podcast:[^)\s]+)\)\s*(.*)$/gm,
  )) {
    const at = parsePodcastHref(m[1]);
    if (at)
      paragraphs.push({
        start: at.seconds,
        end: at.seconds,
        text: m[2].trim(),
      });
  }
  return {
    audio: meta.audio,
    title: meta.title,
    article: meta.article,
    feed: meta.feed,
    paragraphs,
  };
}

/** Where the transcript of an episode is (or would be), by its title. */
export async function transcriptPath(
  pod: PodType,
): Promise<string | undefined> {
  const ws = store.getState().initDir;
  if (!ws) return undefined;
  return joinPaths(readingRoot() ?? ws, [
    TRANSCRIPTS_DIR,
    `${clipFileName(pod.title || "episode")}.md`,
  ]);
}

/** The transcript note of an episode, if made. */
export async function transcriptOf(pod: PodType): Promise<string | undefined> {
  const path = await transcriptPath(pod);
  if (!path) return undefined;
  if (store.getState().notes.has(path)) return path;
  return (await invoke<boolean>("file_exist", { filePath: path }).catch(
    () => false,
  ))
    ? path
    : undefined;
}

const mimeOf = (url: string) =>
  /\.m4a(\?|$)/i.test(url)
    ? "audio/mp4"
    : /\.ogg(\?|$)/i.test(url)
      ? "audio/ogg"
      : /\.wav(\?|$)/i.test(url)
        ? "audio/wav"
        : "audio/mpeg";

/**
 * Transcribe an episode: its audio fetched by the app, sent to the provider
 * of speech to text, the transcript kept as a note.
 * @returns the path of the note
 */
export async function transcribeEpisode(
  pod: PodType,
  onProgress?: (
    state: "download" | "transcribe",
    done?: number,
    of?: number,
  ) => void,
  signal?: AbortSignal,
): Promise<string> {
  const path = await transcriptPath(pod);
  if (!path) throw new Error("Open a folder to keep the transcript in.");
  onProgress?.("download");
  const data = await invoke<ArrayBuffer | Uint8Array | number[]>("fetch_url", {
    url: pod.url,
  });
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const name = decodeURIComponent(
    new URL(pod.url).pathname.split("/").pop() || "audio.mp3",
  );
  const segments = await transcribe(
    bytes,
    { name, type: mimeOf(pod.url) },
    { onPart: (done, of) => onProgress?.("transcribe", done, of), signal },
  );
  if (segments.length === 0)
    throw new Error("No speech was found in the audio.");
  await writeFile(path, transcriptMarkdown(pod, segments));
  await openFilePaths([path.replace(/[\\/][^\\/]*$/, ""), path]);
  return path;
}

/** The episode of a transcript note: from its front matter. */
export async function episodeOfTranscript(
  audio: string,
): Promise<PodType | undefined> {
  const ws = store.getState().initDir;
  if (!ws) return undefined;
  for (const note of store.getState().notes.values()) {
    if (note.is_dir || !/[\\/]transcripts[\\/][^\\/]+\.md$/.test(note.id))
      continue;
    const t = parseTranscript(await noteContent(note.id));
    if (t.audio === audio)
      return {
        title: t.title ?? note.title,
        url: audio,
        article_url: t.article ?? "",
        feed_link: t.feed ?? "",
      };
  }
  return undefined;
}

/** Play a podcast from a time: the one playing, or put in the player first. */
export async function playAt(audio: string, seconds: number) {
  const { currentPod, setCurrentPod } = store.getState();
  const player = usePlayer.getState();
  player.setShown(true);
  if (currentPod?.url === audio && player.seekPod) {
    player.seekPod(seconds);
    return;
  }
  const pod = (await episodeOfTranscript(audio)) ?? {
    title: decodeURIComponent(audio.split("/").pop() ?? audio),
    url: audio,
    article_url: "",
    feed_link: "",
  };
  usePlayer.setState({ pendingSeek: { url: audio, seconds } });
  setCurrentPod(pod);
}
