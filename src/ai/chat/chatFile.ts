import type { Chunk } from "./context";
import type { ChatMsg } from "./prompt";

/**
 * A chat kept as a note (docs/ai.md, "Chats are notes"), in `chats/`: what was
 * asked and answered, the citations as links to their passages, so the note
 * shows up in the backlinks of what it is about.
 */

export const CHATS_DIR = "chats";

export type ChatMeta = { title: string; created: string; model?: string };

/** `[n]` of an answer, not already a link: a link to its passage. */
export function linkCitations(text: string, sources: Chunk[] = []): string {
  return text.replace(/\[(\d+)\](?![(\]])/g, (all, n: string) => {
    const href = sources[Number(n) - 1]?.href;
    return href ? `[${n}](${escapeHref(href)})` : all;
  });
}

/** A link target safe in Markdown: no parentheses or spaces. */
const escapeHref = (href: string) =>
  href.replace(/[()\s]/g, (c) =>
    c === "(" ? "%28" : c === ")" ? "%29" : "%20",
  );

/** The `[n](href)` links of an answer kept back as `[n]` citations, and their passages. */
export function unlinkCitations(text: string): {
  text: string;
  sources: Chunk[];
} {
  const sources: Chunk[] = [];
  const plain = text.replace(
    /\[(\d+)\]\(([^)\s]+)\)/g,
    (_all, n: string, href: string) => {
      sources[Number(n) - 1] = { text: "", href };
      return `[${n}]`;
    },
  );
  // numbers cited with no link kept: holes filled not to shift them
  for (let i = 0; i < sources.length; i++)
    sources[i] ??= { text: "", href: "" };
  return { text: plain, sources };
}

const quoted = (text: string) =>
  text
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");

const yamlString = (s: string) => JSON.stringify(s);

/** The Markdown of a chat. */
export function chatMarkdown(meta: ChatMeta, messages: ChatMsg[]): string {
  const front = [
    "---",
    `title: ${yamlString(meta.title)}`,
    "ai: chat",
    `created: ${meta.created}`,
    ...(meta.model ? [`model: ${yamlString(meta.model)}`] : []),
    "---",
  ].join("\n");
  const parts = messages
    .filter((m) => !m.streaming && (m.role === "user" || m.text.trim()))
    .map((m) => {
      if (m.role === "user") {
        const attached = m.attached?.text.trim()
          ? `${quoted(m.attached.text)}\n>\n> — ${
              m.attached.href
                ? `[${(m.attached.from ?? "source").replace(/[[\]]/g, "")}](${m.attached.href})`
                : (m.attached.from ?? "")
            }\n\n`
          : "";
        return `### Me\n\n${attached}${m.text.trim()}`;
      }
      const head = m.model ? `### AI · ${m.model}` : "### AI";
      return `${head}\n\n${linkCitations(m.text.trim(), m.sources)}`;
    });
  return `${front}\n\n${parts.join("\n\n")}\n`;
}

/** The messages of a chat note, to go on with it. */
export function parseChat(markdown: string): {
  meta: Partial<ChatMeta>;
  messages: ChatMsg[];
} {
  const meta: Partial<ChatMeta> = {};
  let body = markdown;
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (front) {
    body = markdown.slice(front[0].length);
    for (const line of front[1].split(/\r?\n/)) {
      const m = /^(title|created|model):\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      try {
        if (value.startsWith('"')) value = JSON.parse(value) as string;
      } catch {
        // as it is
      }
      meta[m[1] as keyof ChatMeta] = value;
    }
  }
  const messages: ChatMsg[] = [];
  const heads = [...body.matchAll(/^### (Me|AI)(?: · (.+))?\s*$/gm)];
  heads.forEach((head, i) => {
    const start = (head.index ?? 0) + head[0].length;
    const end = heads[i + 1]?.index ?? body.length;
    const text = body.slice(start, end).trim();
    const id = `m${i}`;
    if (head[1] === "Me") messages.push({ id, role: "user", text });
    else {
      const cited = unlinkCitations(text);
      messages.push({
        id,
        role: "assistant",
        text: cited.text,
        ...(cited.sources.length > 0 ? { sources: cited.sources } : {}),
        ...(head[2] ? { model: head[2].trim() } : {}),
      });
    }
  });
  return { meta, messages };
}

/** A name of a file of the title: no characters files can't have, not too long. */
export function chatFileName(title: string, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const name = title
    .replace(/[\\/:*?"<>|#^[\]\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return `${day} ${name || "Chat"}`;
}
