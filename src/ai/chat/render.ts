import { renderToHtml } from "mdsmirror";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Chunk } from "./context";

/** the class of a citation of an answer, a link to its passage */
export const CITE_CLASS = "ai-cite";

/** not in code: `[1]` there is code, not a citation */
const SKIP = new Set(["CODE", "PRE", "A"]);

/**
 * The HTML of an answer: its Markdown as the app renders it, sanitized, its
 * `[n]` citations links to their passages, the passage shown on hover.
 */
export function answerHtml(text: string, sources: Chunk[] = []): string {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(renderToHtml(text));
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let parent = node.parentElement;
    let skip = false;
    while (parent && !skip) {
      skip = SKIP.has(parent.tagName);
      parent = parent.parentElement;
    }
    if (!skip && /\[\d+\]/.test(node.nodeValue ?? "")) nodes.push(node as Text);
  }
  for (const node of nodes) {
    const parts = (node.nodeValue ?? "").split(/(\[\d+\])/);
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      const match = /^\[(\d+)\]$/.exec(part);
      const source = match ? sources[Number(match[1]) - 1] : undefined;
      if (match && source?.href) {
        const link = document.createElement("a");
        link.className = CITE_CLASS;
        link.dataset.cite = match[1];
        link.textContent = match[1];
        link.href = "#";
        if (source.text)
          link.title =
            source.text.length > 240
              ? `${source.text.slice(0, 239)}…`
              : source.text;
        fragment.append(link);
      } else if (part) fragment.append(part);
    }
    node.replaceWith(fragment);
  }
  return template.innerHTML;
}
