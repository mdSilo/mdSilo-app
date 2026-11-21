import type { ChatMessage } from "../protocol";
import type { Chunk, Context } from "./context";

/** Text selected in a book or a note, asked about. */
export type Attached = {
  text: string;
  /** where it is: the title of the book or the note */
  from?: string;
  /** a link to it, as notes link */
  href?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** user: the text selected, asked about */
  attached?: Attached;
  /** assistant: the passages it was given, `[n]` the n-th */
  sources?: Chunk[];
  /** assistant: what its passages were of */
  scopeLabel?: string;
  model?: string;
  /** assistant: why it failed or stopped short */
  error?: string;
  /** assistant: still coming */
  streaming?: boolean;
};

const SYSTEM = `You are the reading and writing companion in mdSilo, a local app where the user reads books and feeds and writes Markdown notes.
Answer in the language of the user's last message unless asked otherwise. Write Markdown. Be direct and concise; no preamble.`;

const CITE = `Below are numbered passages of what the user has open. When a sentence of your answer uses a passage, cite it right after the sentence by its number in square brackets, like [3] or [3][7]. Cite only numbers given below; never make one up. If the passages do not hold the answer, say so, then answer from what you know, without citations.`;

/** The text of the passages, numbered from 1. */
export function numbered(chunks: Chunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
}

/** A user message with the text selected it asks about. */
export function userContent(msg: ChatMsg): string {
  if (!msg.attached?.text.trim()) return msg.text;
  const from = msg.attached.from ? ` (from "${msg.attached.from}")` : "";
  const quote = msg.attached.text
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");
  return `About this passage I selected${from}:\n\n${quote}\n\n${msg.text}`;
}

/** The messages to send: the system prompt with the passages, then the chat so far. */
export function messagesOf(
  history: ChatMsg[],
  context: Context | null,
): ChatMessage[] {
  let system = SYSTEM;
  if (context && context.chunks.length > 0) {
    const partial = context.partial
      ? " (only a part of it: the rest is too long)"
      : "";
    system += `\n\n${CITE}\n\nThe user has open: ${context.label}${partial}\n\n${numbered(context.chunks)}`;
  }
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  for (const msg of history) {
    if (msg.role === "user")
      messages.push({ role: "user", content: userContent(msg) });
    // an answer that failed before any text is left out
    else if (msg.text.trim())
      messages.push({ role: "assistant", content: msg.text });
  }
  return messages;
}

/** Polish the text selected in a note: the answer is its new text only. */
export const POLISH_PROMPT =
  "Polish the passage I selected: clearer and smoother, fixing grammar and spelling, keeping my meaning, my voice, its language and its Markdown. Reply with the polished passage only, nothing before or after it.";

/** The prompts offered for a text selected. */
export const QUICK_PROMPTS = {
  explain: "Explain this passage.",
  summarize: "Summarize this passage.",
  views:
    "What do others think about this? Give other views, for and against, and say where they come from.",
} as const;
