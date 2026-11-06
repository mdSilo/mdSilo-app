import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { mockInvoke } from "@/testUtils";
import { openFilePaths } from "@/workspace/open";
import {
  copyImage,
  imageName,
  imageOf,
  imageTypeOf,
  MAX_IMAGE_BYTES,
  saveImage,
  saveImageToAssets,
  type PluginImage,
} from "./image";

vi.mock("@/workspace/open", () => ({ openFilePaths: vi.fn() }));

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);
const bytes = (s: string) => new TextEncoder().encode(s);
const SVG = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>';

describe("imageTypeOf", () => {
  it("knows the images by their bytes", () => {
    expect(imageTypeOf(PNG)).toBe("image/png");
    expect(imageTypeOf(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(imageTypeOf(bytes("GIF89a"))).toBe("image/gif");
    expect(imageTypeOf(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageTypeOf(bytes(SVG))).toBe("image/svg+xml");
    expect(imageTypeOf(bytes("\uFEFF<svg viewBox='0 0 1 1'></svg>"))).toBe(
      "image/svg+xml",
    );
  });

  it("knows no other file", () => {
    expect(imageTypeOf(bytes("<html><body>hi</body></html>"))).toBeUndefined();
    expect(imageTypeOf(bytes("svg, but text"))).toBeUndefined();
    expect(imageTypeOf(new Uint8Array())).toBeUndefined();
  });
});

describe("imageName", () => {
  it("keeps a plain name, with the extension of the type", () => {
    expect(imageName("quote.png", "image/png")).toBe("quote.png");
    expect(imageName("quote.jpeg", "image/png")).toBe("quote.png");
    expect(imageName("quote", "image/svg+xml")).toBe("quote.svg");
  });

  it("takes no folder or odd character, and has a name always", () => {
    expect(imageName("../../etc/a:b?.png", "image/png")).toBe("ab.png");
    expect(imageName("C:\\x\\card.png", "image/png")).toBe("card.png");
    expect(imageName("...", "image/png")).toBe("image.png");
    expect(imageName(undefined, "image/jpeg")).toBe("image.jpg");
  });
});

describe("imageOf", () => {
  it("is nothing for an answer without image", async () => {
    expect(await imageOf("text")).toBeUndefined();
    expect(await imageOf({ html: "<p>x</p>" })).toBeUndefined();
    expect(await imageOf(null)).toBeUndefined();
  });

  it("takes bytes, a buffer, a Blob or a data: URL", async () => {
    for (const image of [
      PNG,
      PNG.buffer.slice(0),
      new Blob([PNG]),
      `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`,
    ]) {
      const found = await imageOf({ image, name: "q.png", alt: " A quote " });
      expect(found).toMatchObject({
        type: "image/png",
        name: "q.png",
        alt: "A quote",
      });
      expect(found?.blob.size).toBe(PNG.length);
    }
    const svg = await imageOf({
      image: `data:image/svg+xml,${encodeURIComponent(SVG)}`,
    });
    expect(svg).toMatchObject({ type: "image/svg+xml", name: "image.svg" });
  });

  it("goes by the bytes, not the type said", async () => {
    const html = `data:image/png;base64,${btoa("<html><script>1</script>")}`;
    await expect(imageOf({ image: html })).rejects.toThrow(
      "Not an image of PNG, JPEG, WebP, GIF or SVG",
    );
    const png = await imageOf({
      image: new Blob([PNG], { type: "text/html" }),
    });
    expect(png?.type).toBe("image/png");
    expect(png?.blob.type).toBe("image/png");
  });

  it("refuses what is too big, or not bytes", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    await expect(imageOf({ image: big })).rejects.toThrow("too big");
    await expect(imageOf({ image: 42 })).rejects.toThrow("not bytes");
    await expect(imageOf({ image: "https://x.org/a.png" })).rejects.toThrow(
      "not a data: URL",
    );
  });
});

describe("what the app does with it", () => {
  const image = async (alt = "A [quote]\nof it") =>
    (await imageOf({ image: PNG, name: "card.png", alt })) as PluginImage;

  it("saves it in assets/ by a name no file has, and gives the Markdown", async () => {
    store.setState({ initDir: "/ws", layout: "workspace" });
    const written: string[] = [];
    mockInvoke(invoke, {
      file_exist: ({ filePath }: Record<string, unknown>) =>
        filePath === "/ws/writing/assets/card.png",
      write_file_bytes: ({ filePath }: Record<string, unknown>) => {
        written.push(filePath as string);
        return true;
      },
    });
    expect(await saveImageToAssets(await image())).toBe(
      "![A quote of it](./assets/card-1.png)",
    );
    expect(written).toEqual(["/ws/writing/assets/card-1.png"]);
    expect(openFilePaths).toHaveBeenCalledWith([
      "/ws/writing/assets/card-1.png",
    ]);
  });

  it("can't save it in assets/ without a workspace, or if the write fails", async () => {
    store.setState({ initDir: "" });
    await expect(saveImageToAssets(await image())).rejects.toThrow(
      "No workspace is open",
    );
    store.setState({ initDir: "/ws", layout: "workspace" });
    mockInvoke(invoke, { file_exist: false, write_file_bytes: false });
    await expect(saveImageToAssets(await image())).rejects.toThrow(
      "Can't write /ws/writing/assets/card.png",
    );
  });

  it("downloads it on the web", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    expect(await saveImage(await image())).toBe("card.png");
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("copies it as PNG, or says it can't", async () => {
    const write = vi.fn(async () => undefined);
    class Item {
      items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", Item);
    Object.defineProperty(navigator, "clipboard", {
      value: { write },
      configurable: true,
    });
    const img = await image();
    await copyImage(img);
    const [[[item]]] = write.mock.calls as unknown as [[[Item]]];
    expect(await item.items["image/png"]).toBe(img.blob);

    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    await expect(copyImage(img)).rejects.toThrow("can't be copied here");
    vi.unstubAllGlobals();
  });
});
