/**
 * The images of a feed book made smaller in the browser (the web version),
 * as src-tauri/src/book_images.rs does on the desktop: the photos of a site
 * come as big as it has them (a 18 megapixel one, 8 MB), and a reader
 * decodes all of an article's at once, slow, its memory spent.
 */
import { readZip } from "@/reader/convert";
import { createZip, deflateRaw, type ZipEntry } from "@/host/web/zip";

/** The widest an image in a book is, in pixels, as MAX_WIDTH in Rust. */
export const MAX_WIDTH = 1600;

/** The most pixels of an image in a book: a tall one narrower then, as in Rust. */
const MAX_AREA = MAX_WIDTH * MAX_WIDTH;

/** How much an image is made smaller: within MAX_WIDTH and MAX_AREA, its ratio kept; 1 if it is. */
export const scaleOf = (width: number, height: number) =>
  Math.min(
    1,
    MAX_WIDTH / Math.max(1, width),
    Math.sqrt(MAX_AREA / (Math.max(1, width) * Math.max(1, height))),
  );

/** An image small enough but bigger than this, in bytes: encoded again. */
const MAX_BYTES = 1 << 20;

/** An image of a book no bigger than this, in bytes: not even looked at. */
const SMALL_BYTES = 256 << 10;

const JPEG_QUALITY = 0.82;

type Kind = "jpeg" | "png";

const kindOf = (d: Uint8Array): Kind | undefined =>
  d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47
    ? "png"
    : d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff
      ? "jpeg"
      : undefined;

/**
 * The size of a JPEG or a PNG, of its header: not decoded. As stored, before
 * any turn of its EXIF (the longest side is the same).
 */
export function imageSizeOf(
  d: Uint8Array,
): { width: number; height: number } | undefined {
  const kind = kindOf(d);
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (kind === "png" && d.length >= 24)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (kind !== "jpeg") return undefined;
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = d[i + 1];
    // padding, or markers of no length
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    // a start of frame (not DHT 0xc4, JPG 0xc8, DAC 0xcc): its size
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    )
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    i += 2 + view.getUint16(i + 2);
  }
  return undefined;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function canvasOf(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function blobOf(canvas: Canvas, type: string): Promise<Blob | null> {
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

function isOpaque(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
  return true;
}

/**
 * A smaller image of `data`: within MAX_WIDTH and MAX_AREA, turned as its
 * EXIF says. A JPEG stays a JPEG and a PNG a PNG, unless `toJpeg` lets an
 * opaque PNG be a JPEG. Undefined if not smaller, small already, not a JPEG
 * or a PNG, or the browser cannot (no createImageBitmap).
 */
export async function shrinkImage(
  data: Uint8Array,
  toJpeg: boolean,
): Promise<Uint8Array | undefined> {
  const kind = kindOf(data);
  const size = imageSizeOf(data);
  if (!kind || !size || typeof createImageBitmap === "undefined") return;
  // as stored, before its EXIF turns it: either way
  const maybeBig =
    scaleOf(size.width, size.height) < 1 ||
    scaleOf(size.height, size.width) < 1;
  if (!maybeBig && data.length <= MAX_BYTES) return;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([data as BlobPart]), {
      imageOrientation: "from-image",
    });
    const { width, height } = bitmap;
    const scale = scaleOf(width, height);
    const tooBig = scale < 1;
    if (!tooBig && data.length <= MAX_BYTES) return;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const asJpeg = kind === "jpeg" || (toJpeg && isOpaque(ctx, w, h));
    const blob = await blobOf(canvas, asJpeg ? "image/jpeg" : "image/png");
    if (!blob) return;
    const out = new Uint8Array(await blob.arrayBuffer());
    // small enough, encoded again only if much smaller: not again and
    // again, a bit smaller each time, as the book is written again
    const worth = tooBig
      ? out.length < data.length
      : out.length * 4 < data.length * 3;
    return worth ? out : undefined;
  } catch {
    return undefined;
  } finally {
    bitmap?.close();
  }
}

const isImageName = (name: string) => /\.(jpe?g|png)$/i.test(name);

/**
 * The images of an EPUB made smaller, see shrinkImage: the book written
 * again, its other files as they are (deflated if the browser can), each
 * image with its name and format, as the book refers to them; undefined if
 * none is made smaller.
 */
export async function shrinkBookImages(
  epub: Uint8Array,
  shrink: (data: Uint8Array) => Promise<Uint8Array | undefined> = (data) =>
    shrinkImage(data, false),
): Promise<{ epub: Uint8Array; count: number } | undefined> {
  const files = await readZip(epub);
  let count = 0;
  const entries: ZipEntry[] = [];
  for (const { name, data } of files) {
    const small =
      isImageName(name) && data.length > SMALL_BYTES
        ? await shrink(data)
        : undefined;
    if (small) {
      count++;
      entries.push({ name, data: small });
    } else if (name === "mimetype" || isImageName(name)) {
      // the mimetype first and stored, as the format asks; images are compressed already
      entries.push({ name, data });
    } else {
      entries.push({ name, data, deflated: await deflateRaw(data) });
    }
  }
  if (count === 0) return undefined;
  const zip = createZip(entries);
  return { epub: new Uint8Array(await zip.arrayBuffer()), count };
}
