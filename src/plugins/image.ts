import { invoke } from "@tauri-apps/api/core";
import * as dialog from "@tauri-apps/plugin-dialog";
import { writeBytes } from "@/reader/library/library";
import { writingRoot } from "@/workspace/layout";
import { openFilePaths } from "@/workspace/open";
import { createDirRecursive, isTauri, joinPath } from "@/workspace/util";
import { webUrl } from "./host";

/**
 * An image answered by a plugin (`{ image, name?, alt? }`, see ImageAnswer of
 * @mdsilo/plugin-api), shown by the app with its own buttons: copy, save,
 * share, put in the note. The type is read from the bytes, not from what the
 * plugin says: only the images a page shows safely.
 */
export type PluginImage = {
  blob: Blob;
  type: ImageType;
  /** a file name, with the extension of the type */
  name: string;
  alt: string;
  /** buttons to open web pages, e.g. to post it */
  links: ImageLink[];
};

export type ImageLink = { title: string; url: string };

export const MAX_IMAGE_LINKS = 4;

/** The links of an image: http(s), with a title; throws on a bad one */
function linksOf(links: unknown): ImageLink[] {
  if (links === undefined) return [];
  if (!Array.isArray(links)) throw new Error("links is a list");
  return links.slice(0, MAX_IMAGE_LINKS).map((link) => {
    const { title, url } = (link ?? {}) as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim())
      throw new Error("A link wants a title");
    return { title: title.trim().slice(0, 40), url: webUrl(url) };
  });
}

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
} as const;

type ImageType = keyof typeof EXTENSIONS;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) =>
  sig.every((b, i) => bytes[at + i] === b);

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The type of the image by its first bytes */
export function imageTypeOf(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, ...ascii("PNG\r\n\x1a\n")])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF8"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "image/webp";
  // SVG: text with an <svg element near its start (after a BOM, <?xml, comments)
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 1024))
    .replace(/^\uFEFF/, "");
  if (/^\s*</.test(head) && /<svg[\s>]/.test(head)) return "image/svg+xml";
  return undefined;
}

function bytesOfDataUrl(url: string): Uint8Array {
  const match = /^data:([^,]*?)(;base64)?,([\s\S]*)$/.exec(url);
  if (!match) throw new Error("The image is not a data: URL");
  if (match[2]) {
    const binary = atob(match[3]);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(match[3]));
}

/** A file name of the image: no folders or odd characters, its extension */
export function imageName(name: unknown, type: ImageType): string {
  const ext = EXTENSIONS[type];
  const base =
    typeof name === "string"
      ? (name.split(/[\\/]/).pop() ?? "")
          // eslint-disable-next-line no-control-regex
          .replace(/[:*?"<>|\u0000-\u001f]/g, "")
          .replace(/^\.+/, "")
          .trim()
      : "";
  const stem = base.replace(/\.[^.]*$/, "").slice(0, 100) || "image";
  return `${stem}.${ext}`;
}

/**
 * The image of an answer, if it is one (`{ image }`); throws if the image
 * can't be shown: not of a known type, too big.
 */
export async function imageOf(
  answer: unknown,
): Promise<PluginImage | undefined> {
  if (typeof answer !== "object" || answer === null || !("image" in answer))
    return undefined;
  const { image, name, alt, links } = answer as Record<string, unknown>;
  let bytes: Uint8Array;
  if (typeof image === "string") bytes = bytesOfDataUrl(image);
  else if (image instanceof Uint8Array) bytes = image;
  else if (image instanceof ArrayBuffer) bytes = new Uint8Array(image);
  else if (image instanceof Blob)
    bytes = new Uint8Array(await image.arrayBuffer());
  else throw new Error("The image is not bytes, a Blob or a data: URL");
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new Error("The image is too big (20 MB at most)");
  const type = imageTypeOf(bytes);
  if (!type) throw new Error("Not an image of PNG, JPEG, WebP, GIF or SVG");
  return {
    blob: new Blob([bytes as BlobPart], { type }),
    type,
    name: imageName(name, type),
    alt: typeof alt === "string" ? alt.trim() : "",
    links: linksOf(links),
  };
}

const bytesOf = async (image: PluginImage) =>
  new Uint8Array(await image.blob.arrayBuffer());

/** The image as PNG, as a clipboard takes it */
async function pngOf(image: PluginImage): Promise<Blob> {
  if (image.type === "image/png") return image.blob;
  const url = URL.createObjectURL(image.blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1200;
    canvas.height = img.naturalHeight || 630;
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Can't make a PNG of it")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Copies the image, as PNG */
export async function copyImage(image: PluginImage): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Images can't be copied here; save it instead");
  // the promise of the blob keeps the click as the reason to copy (WebKit)
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": pngOf(image) }),
  ]);
}

/** Saves the image where the user chooses; the path, or undefined if cancelled */
export async function saveImage(
  image: PluginImage,
): Promise<string | undefined> {
  if (!isTauri) {
    const url = URL.createObjectURL(image.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = image.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return image.name;
  }
  const path = await dialog.save({
    defaultPath: image.name,
    filters: [{ name: "Image", extensions: [EXTENSIONS[image.type]] }],
  });
  if (!path) return undefined;
  if (!(await writeBytes(path, await bytesOf(image))))
    throw new Error(`Can't write ${path}`);
  return path;
}

const fileOf = (image: PluginImage) =>
  new File([image.blob], image.name, { type: image.type });

/** The system can share the image (a share sheet: macOS, iOS, Android…) */
export const canShareImage = (image: PluginImage) =>
  typeof navigator.share === "function" &&
  Boolean(navigator.canShare?.({ files: [fileOf(image)] }));

/** Shares the image; text, e.g. the quote and where it is from, with it */
export async function shareImage(
  image: PluginImage,
  text?: string,
): Promise<void> {
  await navigator.share({
    files: [fileOf(image)],
    ...(text ? { text } : {}),
  });
}

/** `![alt](src)`, the alt text kept on one line, without brackets */
const markdownImage = (alt: string, src: string) =>
  `![${alt.replace(/[[\]\\]/g, "").replace(/\s+/g, " ")}](${src})`;

/**
 * Saves the image in `assets/` of the notes, as attached files are, by a
 * name no other file there has; the Markdown to show it in a note.
 */
export async function saveImageToAssets(image: PluginImage): Promise<string> {
  const root = writingRoot();
  if (!root) throw new Error("No workspace is open");
  const dir = joinPath(root, "assets");
  await createDirRecursive(dir);
  const dot = image.name.lastIndexOf(".");
  const [stem, ext] = [image.name.slice(0, dot), image.name.slice(dot)];
  for (let i = 0; ; i++) {
    const name = i === 0 ? image.name : `${stem}-${i}${ext}`;
    const path = joinPath(dir, name);
    if (await invoke<boolean>("file_exist", { filePath: path })) continue;
    if (!(await writeBytes(path, await bytesOf(image))))
      throw new Error(`Can't write ${path}`);
    // in the tree now, not once the watcher tells
    void openFilePaths([path]);
    return markdownImage(image.alt, encodeURI(`./assets/${name}`));
  }
}
