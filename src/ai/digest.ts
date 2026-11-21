import { store } from "@/state/store";
import { fromWorkspacePath } from "@/workspace/util";
import { getArticleList } from "@/feed/dataAgent";
import { feedHtmlOf, textOfHtml } from "@/feed/fullText";
import { writeNote } from "@/plugins/workspaceApi";
import type { ArticleType } from "@/types/model";
import { complete } from "./client";
import { CHATS_DIR, linkCitations } from "./chat/chatFile";
import type { Chunk } from "./chat/context";

/**
 * A digest of the feeds (docs/ai.md, "Summaries for feeds"): the new unread
 * articles summarized by topic by the provider of quick tasks, each cited
 * with a link to it, kept as a note `chats/<day> Digest.md`; made once a day
 * if set, or when asked.
 */

/** articles new since so many hours ago */
const NEW_HOURS = 36;
/** articles in a digest at most */
const MAX_ARTICLES = 30;
/** characters of an article given */
const ARTICLE_CHARS = 500;

/** A day as kept: YYYY-MM-DD, local time. */
export const dayOf = (date: Date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The unread articles new enough, the latest first. */
export function newArticles(
  articles: ArticleType[],
  now = new Date(),
): ArticleType[] {
  const since = now.getTime() - NEW_HOURS * 3600_000;
  const time = (a: ArticleType) =>
    a.published ? new Date(a.published).getTime() : NaN;
  return articles
    .filter((a) => a.read_status === 0)
    .filter((a) => {
      const t = time(a);
      return Number.isNaN(t) || t >= since;
    })
    .sort((a, b) => (time(b) || 0) - (time(a) || 0))
    .slice(0, MAX_ARTICLES);
}

const PROMPT = `Write a digest of these new articles of the user's feeds. Group them by topic under Markdown headings, the most interesting first; a sentence or two for each article. Cite each article you mention by its number in square brackets, like [3]. Write in the language most of the articles are in. No preamble.`;

/**
 * Make the digest of today; none without a workspace or new articles.
 * @returns the id of its note
 */
export async function makeDigest(
  now = new Date(),
): Promise<string | undefined> {
  const ws = store.getState().initDir;
  if (!ws) return undefined;
  const articles = newArticles(await getArticleList(null, 0, null), now);
  if (articles.length === 0) return undefined;
  const sources: Chunk[] = articles.map((a) => ({
    text: a.title,
    href: a.url,
    title: a.title,
  }));
  const list = articles
    .map((a, i) => {
      const text = textOfHtml(feedHtmlOf(a)).replace(/\s+/g, " ").trim();
      return `[${i + 1}] ${a.title}${a.author ? ` (${a.author})` : ""}\n${text.slice(0, ARTICLE_CHARS)}`;
    })
    .join("\n\n");
  const text = await complete({
    role: "fast",
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: list },
    ],
  });
  const day = dayOf(now);
  const rel = `${CHATS_DIR}/${day} Digest.md`;
  const id = fromWorkspacePath(ws, rel);
  const body = [
    "---",
    `title: ${JSON.stringify(`Digest ${day}`)}`,
    "ai: digest",
    `created: ${now.toISOString()}`,
    "---",
    "",
    linkCitations(text.trim(), sources),
    "",
  ].join("\n");
  await writeNote({
    path: rel,
    text: body,
    create: !store.getState().notes.has(id),
  });
  return id;
}

/** The digest of today, if set and not made yet today; errors only logged. */
export async function digestIfDue(now = new Date()) {
  const { aiSettings, setAiSettings, initDir } = store.getState();
  const today = dayOf(now);
  if (!aiSettings.digest || !initDir || aiSettings.lastDigest === today) return;
  // once a day, even if it fails: not again at each start
  setAiSettings({ ...aiSettings, lastDigest: today });
  try {
    await makeDigest(now);
  } catch (e) {
    console.warn("The digest of the feeds failed", e);
  }
}
