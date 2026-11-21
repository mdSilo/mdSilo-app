import { store } from "@/state/store";
import { toWorkspacePath } from "@/workspace/util";

/**
 * What the AI never reads (docs/ai.md, "Privacy"): a note whose front matter
 * says `ai: false`, and what is in a folder excluded in Settings > AI.
 */

/** The folders excluded, as relative paths without slashes at the ends. */
export function excludedFolders(): string[] {
  return (store.getState().aiSettings.excluded ?? [])
    .map((f) =>
      f
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, ""),
    )
    .filter(Boolean);
}

/** The file (an absolute path) is in a folder excluded. */
export function isExcludedPath(path: string): boolean {
  const ws = store.getState().initDir;
  if (!ws) return false;
  const rel = toWorkspacePath(ws, path).replace(/\\/g, "/");
  return excludedFolders().some((f) => rel === f || rel.startsWith(`${f}/`));
}

/** The front matter of the Markdown says `ai: false`. */
export function saysNoAi(markdown: string): boolean {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return Boolean(front && /^ai:\s*(false|no|off)\s*$/im.test(front[1]));
}

/** The note may not be read by the AI: by its folder or its front matter. */
export const isExcludedNote = (path: string, content?: string) =>
  isExcludedPath(path) || (content !== undefined && saysNoAi(content));
