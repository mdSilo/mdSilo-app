import { fetchBytes, MAX_BOOK_BYTES } from "@/feed/opds";
import { isBookFile } from "@/reader/document";
import { importBookData } from "./library";

/**
 * A book shared by a link: the book file in a public git repo the workspace
 * syncs to, opened in the web app at a place of it, e.g. the text quoted.
 * `https://mdsilo.github.io/mdSilo-app/?read=<the file>&cfi=<the place>`;
 * the web app asks, downloads the book into `reading/` and opens it there.
 */

/** The web app, where shared books are read */
export const WEB_APP_URL = "https://mdsilo.github.io/mdSilo-app/";

/** The link to read the book file at the place, in the web app */
export function readLinkOf(fileUrl: string, cfi?: string): string {
  const params = new URLSearchParams({ read: fileUrl });
  if (cfi) params.set("cfi", cfi);
  return `${WEB_APP_URL}?${params.toString()}`;
}

export type SharedBook = { url: string; cfi?: string };

/** The book shared in the URL of the page, if any: https only */
export function sharedBookOf(search: string): SharedBook | undefined {
  const params = new URLSearchParams(search);
  const url = params.get("read");
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    if (!isBookFile(fileNameOf(parsed.href))) return undefined;
  } catch {
    return undefined;
  }
  const cfi = params.get("cfi");
  return cfi?.startsWith("epubcfi(") ? { url, cfi } : { url };
}

/** The file name of the book at the URL, decoded, without odd characters */
export function fileNameOf(url: string): string {
  const last = new URL(url).pathname.split("/").pop() ?? "";
  let name: string;
  try {
    name = decodeURIComponent(last);
  } catch {
    name = last;
  }
  const clean = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/^[.\s]+/, "")
    .trim();
  return clean || "book";
}

/**
 * The address of a file of the repo, to download: of a remote on GitHub,
 * GitLab, or Gitea (Codeberg...); undefined for another host, or not https.
 * Credentials in the remote URL are left out.
 */
export function repoFileUrl(
  remoteUrl: string,
  branch: string,
  path: string,
): string | undefined {
  let remote: URL;
  try {
    remote = new URL(remoteUrl);
  } catch {
    return undefined;
  }
  if (remote.protocol !== "https:") return undefined;
  const [owner, repo] = remote.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (!owner || !repo) return undefined;
  const file = path.split("/").map(encodeURIComponent).join("/");
  const ref = encodeURIComponent(branch);
  const host = remote.host.toLowerCase();
  if (host === "github.com")
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}`;
  if (host === "gitlab.com")
    return `https://gitlab.com/${owner}/${repo}/-/raw/${ref}/${file}`;
  if (host === "codeberg.org" || host.startsWith("gitea."))
    return `https://${host}/${owner}/${repo}/raw/branch/${ref}/${file}`;
  return undefined;
}

/** Downloads the shared book into `reading/` of the workspace; its path */
export async function importSharedBook(
  ws: string,
  book: SharedBook,
): Promise<string> {
  const name = fileNameOf(book.url);
  const data = await fetchBytes(book.url, MAX_BOOK_BYTES);
  const path = await importBookData(ws, name, data);
  if (!path) throw new Error(`Failed to write the book "${name}"`);
  return path;
}
