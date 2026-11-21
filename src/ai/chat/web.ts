import { blocksOf, textOf } from "@/reader/blocks";
import { articleOfPage, decodeHtml, readBytes } from "@/feed/fullText";
import { clipArticle } from "@/feed/clip";
import type { ServerTool, ToolCall, ToolSpec } from "../protocol";
import type { AiProvider, SearchService } from "../providers";
import { fetchJson } from "../transport";
import type { Chunk } from "./context";
import { TOOL_CHARS, type ToolResult } from "./tools";

/**
 * The web for the chat (docs/ai.md, "Reference lookup and fact checks"):
 * Anthropic's own web search and fetch, or, for other providers, a search
 * service set up in Settings > AI and the pages read by the app. What they
 * find is cited like the passages of the workspace, a page can be kept as a
 * clip.
 */

/** Anthropic's tools of the web; the older version for models without the newer. */
export const anthropicWebTools = (basic = false): ServerTool[] =>
  basic
    ? [{ server: { type: "web_search_20250305", name: "web_search" } }]
    : [
        { server: { type: "web_search_20260209", name: "web_search" } },
        { server: { type: "web_fetch_20260209", name: "web_fetch" } },
      ];

/** The tools of the web run here, with a search service. */
export const WEB_TOOLS: ToolSpec[] = [
  {
    name: "web_search",
    description:
      "Search the web. Gives back numbered results (title, address, excerpt) to cite.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_page",
    description:
      "Read a page of the web, e.g. a result of web_search, by its address. Gives back its text as numbered passages.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The http(s) address." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
];

export const isWebTool = (name: string) =>
  WEB_TOOLS.some((t) => t.name === name);

/** How the chat can reach the web with this provider, if at all. */
export function webOf(
  provider: AiProvider,
  service: SearchService | undefined,
): "anthropic" | "service" | undefined {
  if (provider.kind === "anthropic") return "anthropic";
  return service ? "service" : undefined;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The results of a search, as passages: their title and excerpt, their address. */
export function resultsOf(service: SearchService, answer: any): Chunk[] {
  const list: any[] =
    service.settings.service === "brave"
      ? (answer?.web?.results ?? [])
      : (answer?.results ?? []);
  return list
    .filter((r) => typeof r?.url === "string" && /^https?:\/\//i.test(r.url))
    .slice(0, 8)
    .map((r) => {
      const title = String(r.title ?? r.url);
      const excerpt = String(r.content ?? r.description ?? r.snippet ?? "")
        .replace(/<[^>]+>/g, "")
        .trim();
      return {
        text: `${title} (${r.url})${excerpt ? `: ${excerpt}` : ""}`,
        href: r.url,
        title,
      };
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function searchWeb(
  service: SearchService,
  query: string,
): Promise<Chunk[]> {
  const q = encodeURIComponent(query);
  const answer =
    service.settings.service === "brave"
      ? await fetchJson(service.id, "GET", `/web/search?q=${q}&count=8`)
      : service.settings.service === "tavily"
        ? await fetchJson(service.id, "POST", "/search", {
            query,
            max_results: 8,
          })
        : await fetchJson(service.id, "GET", `/search?q=${q}&format=json`);
  return resultsOf(service, answer);
}

/** The text of a page as paragraphs, and its title: by Readability, else all its text. */
export async function readPage(
  url: string,
): Promise<{ title: string; html: string; paragraphs: string[] }> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`Not a web address: ${url}`);
  const html = decodeHtml(await readBytes(url));
  const page = await articleOfPage(html, url);
  const doc = new DOMParser().parseFromString(page?.html ?? html, "text/html");
  let paragraphs = blocksOf(doc).map(textOf);
  if (paragraphs.length === 0) {
    const text = doc.body?.textContent?.replace(/\s+/g, " ").trim();
    paragraphs = text ? [text] : [];
  }
  const title =
    page?.title ||
    new DOMParser().parseFromString(html, "text/html").title ||
    url;
  return { title, html: page?.html ?? html, paragraphs };
}

const numberedFrom = (chunks: Chunk[], first: number) =>
  chunks.map((c, i) => `[${first + i}] ${c.text}`).join("\n\n");

/** Run a call of a tool of the web; its passages numbered from `first`. */
export async function runWebTool(
  call: ToolCall,
  service: SearchService | undefined,
  first: number,
): Promise<ToolResult> {
  try {
    if (!call.input) throw new Error("The input is not valid JSON.");
    if (call.name === "web_search") {
      if (!service) throw new Error("No search service is set up.");
      const query = String(call.input.query ?? "").trim();
      if (!query) throw new Error("`query` is wanted.");
      const chunks = await searchWeb(service, query);
      return {
        text: chunks.length
          ? numberedFrom(chunks, first)
          : `Nothing found for "${query}".`,
        chunks,
        step: `web search: ${query}`,
      };
    }
    const url = String(call.input.url ?? "").trim();
    const { title, paragraphs } = await readPage(url);
    const chunks: Chunk[] = [];
    let used = 0;
    for (const text of paragraphs) {
      if (used + text.length > TOOL_CHARS) break;
      chunks.push({ text, href: url, title });
      used += text.length;
    }
    return {
      text: `${title}:\n\n${numberedFrom(chunks, first)}`,
      chunks,
      step: `read page: ${title}`,
    };
  } catch (e) {
    return {
      text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      chunks: [],
      step: `${call.name}: failed`,
    };
  }
}

/**
 * Keep a page of the web as a clip (`clips/`), its text as the app reads
 * it; the excerpt given if the page cannot be read.
 * @returns the title of the clip note, none without a workspace
 */
export async function clipPage(
  url: string,
  title?: string,
  excerpt = "",
): Promise<string | undefined> {
  let page: { title: string; html: string } | undefined;
  try {
    page = await readPage(url);
  } catch {
    page = undefined;
  }
  const clipTitle = (page?.title || title || url).trim();
  const path = await clipArticle({
    id: 0,
    title: clipTitle,
    url,
    feed_link: "",
    audio_url: "",
    description: "",
    read_status: 0,
    star_status: 0,
    content: page?.html ?? `<p>${excerpt.replace(/</g, "&lt;")}</p>`,
  });
  return path ? path.split(/[\\/]/).pop()?.replace(/\.md$/, "") : undefined;
}
