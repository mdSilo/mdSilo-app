export type ResolveImageSrcOptions = {
  // the root dir of the workspace, `./` paths are relative to it
  rootPath?: string;
  // the dir of the current document, other relative paths are relative to it
  docPath?: string;
  protocol?: string; // asset: or https://asset.localhost
  // local file path to url to load it, e.g. Tauri's convertFileSrc
  resolveSrc?: (filePath: string) => string;
};

function safeDecodeURI(str: string) {
  try {
    return decodeURI(str);
  } catch {
    return str;
  }
}

// e.g. `https:`, `data:`, `blob:`, `asset:`, protocol-relative `//`, or anchor
const NOT_LOCAL = /^([a-zA-Z][a-zA-Z\d+\-.]*:|\/\/|#)/;
// `/home/me/a.png` or `C:\me\a.png`, `C:/me/a.png`
const ABSOLUTE = /^(\/(?!\/)|[a-zA-Z]:[\\/])/;

/**
 * join a relative path onto a dir, resolving `.` and `..` segments
 */
export function joinRelative(dir: string, rel: string): string {
  const base = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const isAbs = base.startsWith("/");
  const parts = base.split("/").filter((p, i) => p !== "" || i === 0);
  // keep the leading empty part of a posix absolute path, or drive of windows
  const head = parts.shift() ?? "";
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const joined = [head, ...parts].join("/");
  return isAbs && !joined.startsWith("/") ? `/${joined}` : joined || "/";
}

/**
 * resolve the src of image to url which can be loaded, for local images:
 * - `./a.png` relative to rootPath, the path mdSilo writes for attachments
 * - `a.png`, `img/a.png`, `../a.png` relative to the dir of the document
 * - `/home/me/a.png`, `C:\me\a.png` absolute path
 */
export function resolveImageSrc(
  src: string,
  { rootPath, docPath, protocol, resolveSrc }: ResolveImageSrcOptions
): string {
  if (!src || (NOT_LOCAL.test(src) && !ABSOLUTE.test(src))) {
    return src;
  }

  if (src.startsWith("./") && rootPath) {
    if (resolveSrc) {
      return resolveSrc(joinRelative(rootPath, safeDecodeURI(src)));
    }
    if (protocol) {
      return src.replace("./", `${protocol}${rootPath}/`);
    }
    return src;
  }

  if (!resolveSrc) {
    return src;
  }

  const path = safeDecodeURI(src);
  if (ABSOLUTE.test(path)) {
    return resolveSrc(path);
  }

  const baseDir = docPath || rootPath;
  if (baseDir) {
    return resolveSrc(joinRelative(baseDir, path));
  }
  return src;
}
