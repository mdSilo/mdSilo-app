import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { joinPath, toWorkspacePath } from "@/workspace/util";
import { dataRoot } from "@/workspace/layout";
import { checkFileIsMd } from "@/workspace/process";
import { noteContent } from "@/lib/contentCache";
import type { Note } from "@/types/model";
import { complete } from "./client";
import { CHATS_DIR } from "./chat/chatFile";
import { isExcludedNote, isExcludedPath } from "./chat/privacy";
import { TRANSCRIPTS_DIR } from "./transcript";

/**
 * Myself (docs/ai.md, "Chat with myself"): what the user's own words say of
 * them, distilled into a profile (`.mdsilo/ai/profile.md`, synced, plain
 * Markdown the user can edit), proposed by the model as a change the user
 * takes or not; and given to the chat with all the notes.
 *
 * Own words only: the notes and their annotations, not the chats (written
 * by the AI), transcripts or clips (written by others).
 */

export const PROFILE_FILE = "ai/profile.md";

/** words of the notes given at most, in characters */
export const MATERIAL_CHARS = 40_000;
/** of each note at most */
const NOTE_CHARS = 1_200;

export function profilePath(): string | undefined {
  const data = dataRoot();
  return data ? joinPath(data, PROFILE_FILE) : undefined;
}

export async function readProfile(): Promise<string> {
  const path = profilePath();
  if (!path) return "";
  try {
    return (await invoke<string>("read_file", { filePath: path })) ?? "";
  } catch {
    return "";
  }
}

export async function writeProfile(text: string) {
  const path = profilePath();
  if (!path) throw new Error("Open a workspace to keep the profile in.");
  await invoke("create_dir_recursive", {
    dirPath: path.replace(/[\\/][^\\/]*$/, ""),
  });
  const ok = await invoke<boolean>("write_file", { filePath: path, text });
  if (ok === false) throw new Error("The profile could not be written.");
}

/** The user wrote it: a note, not a chat, transcript or clip, not excluded. */
export function isOwnNote(note: Note): boolean {
  const ws = store.getState().initDir;
  if (!ws || note.is_dir || !checkFileIsMd(note.id) || isExcludedPath(note.id))
    return false;
  const rel = toWorkspacePath(ws, note.id).replace(/\\/g, "/");
  const parts = rel.split("/");
  return !parts.some(
    (p) =>
      p.startsWith(".") ||
      p === CHATS_DIR ||
      p === TRANSCRIPTS_DIR ||
      p === "clips",
  );
}

const withoutFrontMatter = (text: string) =>
  text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

/**
 * The words of the user's notes, the latest changed first (since `since` if
 * given): their titles and starts, as many as the budget holds.
 */
export async function ownWords(
  options: { since?: Date; budget?: number } = {},
): Promise<{ text: string; notes: number }> {
  const budget = options.budget ?? MATERIAL_CHARS;
  const since = options.since?.getTime();
  const notes = [...store.getState().notes.values()]
    .filter(isOwnNote)
    .filter(
      (n) => since === undefined || new Date(n.updated_at).getTime() >= since,
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const parts: string[] = [];
  let used = 0;
  for (const note of notes) {
    const content = await noteContent(note.id);
    if (isExcludedNote(note.id, content)) continue;
    const body = withoutFrontMatter(content);
    if (!body) continue;
    const part = `## ${note.title} (${note.updated_at.slice(0, 10)})\n${body.slice(0, NOTE_CHARS)}`;
    if (used + part.length > budget) break;
    parts.push(part);
    used += part.length;
  }
  return { text: parts.join("\n\n"), notes: parts.length };
}

const PROFILE_PROMPT = `You keep a profile of the user, made of their own notes, for an assistant that talks with them about their reading and writing. Write it in Markdown with these sections:
## Interests
## Recurring themes
## Views they hold
## Open questions
## How they write
Under each, short bullets; after a bullet, the notes it comes from as [[note title]] links. Only what the notes show; no guessing about their private life. Write in the language most of the notes are in.
If a profile is given, update it: keep what still holds (and what the user wrote in it themselves), change what the notes now say otherwise, add what is new. Reply with the whole profile only.`;

/** A profile proposed by the model: of the notes, the current one updated. */
export async function proposeProfile(signal?: AbortSignal): Promise<string> {
  const [current, words] = await Promise.all([readProfile(), ownWords()]);
  if (!words.text) throw new Error("No notes of yours to make a profile of.");
  const answer = await complete({
    messages: [
      { role: "system", content: PROFILE_PROMPT },
      {
        role: "user",
        content: `${current.trim() ? `The profile now:\n\n${current.trim()}\n\n` : ""}My notes, the latest first:\n\n${words.text}`,
      },
    ],
    signal,
  });
  return `${answer.trim()}\n`;
}

export type DiffLine = { type: "same" | "add" | "del"; line: string };

/** The lines of `after` against `before`: kept, added, taken out (by their longest common run). */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.replace(/\n$/, "").split("\n") : [];
  const b = after ? after.replace(/\n$/, "").split("\n") : [];
  // lengths of the longest common runs of the ends
  const lcs = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1])
      out.push({ type: "del", line: a[i++] });
    else out.push({ type: "add", line: b[j++] });
  }
  while (i < a.length) out.push({ type: "del", line: a[i++] });
  while (j < b.length) out.push({ type: "add", line: b[j++] });
  return out;
}

/** The thinking partner, for the chat with all the notes: the profile in. */
export function myselfPrompt(profile: string): string {
  return `You talk with the user as a thinking partner who knows their notes. Quote their notes when they bear on the question; point out where they contradicted themselves or changed their mind; ask back when it helps them think.${
    profile.trim()
      ? `\n\nTheir profile, made of their notes:\n\n${profile.trim()}`
      : ""
  }`;
}
