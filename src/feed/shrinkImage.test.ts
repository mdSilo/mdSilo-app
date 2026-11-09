import { createZip } from "@/host/web/zip";
import { readZip } from "@/reader/convert";
import {
  imageSizeOf,
  scaleOf,
  shrinkBookImages,
  shrinkImage,
} from "./shrinkImage";

/** A JPEG of its header only: APP0, then a start of frame of the size. */
function jpegHeader(width: number, height: number, length = 64): Uint8Array {
  const d = new Uint8Array(Math.max(length, 32));
  d.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  d.set([0xff, 0xc0, 0x00, 0x11, 0x08], 8);
  d.set([height >> 8, height & 255, width >> 8, width & 255], 13);
  return d;
}

function pngHeader(width: number, height: number): Uint8Array {
  const d = new Uint8Array(32);
  d.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(d.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return d;
}

const text = (s: string) => new TextEncoder().encode(s);

describe("images made smaller in the browser", () => {
  test("the size of a JPEG or a PNG, of its header", () => {
    expect(imageSizeOf(jpegHeader(4000, 3000))).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(imageSizeOf(pngHeader(1200, 800))).toEqual({
      width: 1200,
      height: 800,
    });
    expect(imageSizeOf(text("GIF89a"))).toBeUndefined();
    expect(imageSizeOf(new Uint8Array([0xff, 0xd8, 0xff]))).toBeUndefined();
  });

  test("left as they are: small, not a JPEG or PNG, or no way to decode", async () => {
    expect(await shrinkImage(jpegHeader(800, 600), true)).toBeUndefined();
    expect(await shrinkImage(text("GIF89a not really"), true)).toBeUndefined();
    // jsdom has no createImageBitmap: the image as it is, no error
    expect(await shrinkImage(jpegHeader(4000, 3000), true)).toBeUndefined();
    // within 1600 wide and 1600 x 1600 pixels: a tall one narrower, not 1600 high
    expect(scaleOf(4000, 2000)).toBe(0.4);
    expect(scaleOf(1000, 6000)).toBeCloseTo(0.6532, 4);
    expect(scaleOf(1200, 800)).toBe(1);
  });

  test("the big images of a book made smaller, its other files as they are", async () => {
    const big = jpegHeader(4000, 3000, 300 << 10);
    const small = jpegHeader(400, 300);
    const xhtml = text("<html><img src='a/1.jpg'/></html>");
    const epub = new Uint8Array(
      await createZip([
        { name: "mimetype", data: text("application/epub+zip") },
        { name: "OEBPS/a.xhtml", data: xhtml },
        { name: "OEBPS/a/1.jpg", data: big },
        { name: "OEBPS/a/2.jpg", data: small },
      ]).arrayBuffer(),
    );
    const asked: number[] = [];
    const smaller = await shrinkBookImages(epub, async (data) => {
      asked.push(data.length);
      return jpegHeader(1600, 1200);
    });
    // only the big one asked: the small ones not even looked at
    expect(asked).toEqual([big.length]);
    expect(smaller?.count).toBe(1);
    const files = await readZip(smaller!.epub);
    expect(files.map((f) => f.name)).toEqual([
      "mimetype",
      "OEBPS/a.xhtml",
      "OEBPS/a/1.jpg",
      "OEBPS/a/2.jpg",
    ]);
    const byName = new Map(files.map((f) => [f.name, f.data]));
    expect(new TextDecoder().decode(byName.get("mimetype"))).toBe(
      "application/epub+zip",
    );
    expect(Array.from(byName.get("OEBPS/a.xhtml")!)).toEqual(Array.from(xhtml));
    expect(imageSizeOf(byName.get("OEBPS/a/1.jpg")!)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(Array.from(byName.get("OEBPS/a/2.jpg")!)).toEqual(Array.from(small));
    // none smaller: the book as it is
    expect(await shrinkBookImages(epub, async () => undefined)).toBeUndefined();
  });
});
