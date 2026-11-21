import type { ChatMessage } from "../protocol";
import { EXCLUDED, type Chunk, type Context } from "./context";
import type { ToolScope } from "./tools";

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
  /** assistant: what its tools did, e.g. `search: words` */
  steps?: string[];
};

const SYSTEM = `You are the reading and writing companion in mdSilo, a local app where the user reads books and feeds and writes Markdown notes.
Answer in the language of the user's last message unless asked otherwise. Write Markdown. Be direct and concise; no preamble.`;

const CITE = `When a sentence of your answer uses a numbered passage, cite it right after the sentence by its number in square brackets, like [3] or [3][7]. Cite only numbers you were given; never make one up. If the passages do not hold the answer, say so, then answer from what you know, without citations.`;

/** How to use the tools of a scope. */
function toolsHelp(scope: ToolScope): string {
  const what =
    scope.kind === "book"
      ? "the whole book open in the reader: `search` finds passages with words, `read` reads a chapter, `list` lists the chapters"
      : `${scope.label}: \`search\` finds passages with words, \`read\` reads a note by its title, \`list\` lists the notes`;
  return `You can look up ${what}. Use them when what you were given does not hold the answer; a few calls are usually enough. They give back numbered passages, numbered on from those given: cite them the same way.`;
}

const WEB_HELP = `You can search the web and read its pages. Use them for facts you are not sure of, recent events, and other views; say where a view comes from. Cite what you use.`;

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

/** The messages to send: the system prompt with the passages (and the tools), then the chat so far. */
export function messagesOf(
  history: ChatMsg[],
  context: Context | null,
  tools?: ToolScope,
  web = false,
  /** more of the system prompt, e.g. the profile of the user */
  extra?: string,
): ChatMessage[] {
  let system = SYSTEM;
  if (extra?.trim()) system += `\n\n${extra.trim()}`;
  const passages = context && context.chunks.length > 0;
  if (passages || tools || web) system += `\n\n${CITE}`;
  if (tools) system += `\n\n${toolsHelp(tools)}`;
  if (web) system += `\n\n${WEB_HELP}`;
  if (passages) {
    const partial = context.partial
      ? " (only a part of it: the rest is too long)"
      : "";
    system += `\n\nBelow are numbered passages of what the user has open: ${context.label}${partial}\n\n${numbered(context.chunks)}`;
  } else if (context?.label.includes(EXCLUDED)) {
    system += `\n\nThe user has open: ${context.label}; you may not read it.`;
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

/** Asked for other views with no web: said plainly to be the model's own knowledge. */
export const NO_WEB_VIEWS =
  "You cannot search the web now: say plainly that this comes from your own knowledge, without sources.";

/** Notes like the one open, found through all the notes. */
export const relatedPrompt = (title: string) =>
  `Find my notes related to the note I have open${title ? ` ("${title}")` : ""}: search for its main ideas, then list the related notes as [[note title]] links, each with a sentence on how it relates. Say which links would be worth adding to this note.`;

/** Tags for the note open, of those already used where they fit. */
export const tagsPrompt = (used: string[]) =>
  `Suggest three to five tags for the note I have open, written #like this#.${
    used.length
      ? ` Prefer the tags I already use where they fit: ${used.map((t) => `#${t}#`).join(" ")}.`
      : ""
  } One line on why for each.`;

/** The prompts offered for a text selected. */
export const QUICK_PROMPTS = {
  explain: "Explain this passage.",
  summarize: "Summarize this passage.",
  views:
    "What do others think about this? Give other views, for and against, and say where they come from.",
} as const;
