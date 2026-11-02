import "fake-indexeddb/auto";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_READER_SETTINGS } from "@/reader/settings";
import { bookStyles, themeColors } from "@/reader/styles";
import { moveTo } from "./store";
import {
  listSystemFonts,
  addSystemFont,
  allFonts,
  familyOfFile,
  fontFaceCss,
  fontFamilyOf,
  fontFamilyWithCjk,
  fonts,
  importFont,
  removeFont,
  SANS,
  SERIF,
} from "./fonts";

describe("fontFamilyOf", () => {
  const customFonts = [
    {
      id: "a1",
      family: "Noto 'Serif'",
      fileName: "noto.ttf",
      where: "device" as const,
    },
  ];

  it("is empty for the default of the view", () => {
    expect(fontFamilyOf("")).toBe("");
    expect(fontFamilyOf("book")).toBe("");
  });

  it("gives the generic stacks, also for the old reader values", () => {
    expect(fontFamilyOf("serif")).toBe(SERIF);
    expect(fontFamilyOf("sans-serif")).toBe(SANS);
    expect(fontFamilyOf("monospace")).toContain("monospace");
  });

  it("quotes bundled families, also the old editor values", () => {
    expect(fontFamilyOf("Sniglet")).toBe("'Sniglet'");
  });

  it("quotes the fonts of the system by their family", () => {
    expect(fontFamilyOf("system:Noto Serif")).toBe("'Noto Serif'");
    expect(fontFamilyOf("system:It's")).toBe("'Its'");
  });

  it("finds the fonts added, without the quotes of their names", () => {
    expect(fontFamilyOf("custom:a1", customFonts)).toBe("'Noto Serif'");
    expect(fontFamilyOf("custom:gone", customFonts)).toBe("");
  });
});

it("makes a family name of a file name", () => {
  expect(familyOfFile("Noto_Serif-Regular.ttf")).toBe("Noto Serif");
  expect(familyOfFile("LXGWWenKai.woff2")).toBe("LXGWWenKai");
});

it("has no @font-face for a font not loaded", () => {
  expect(
    fontFaceCss("custom:a1", [
      { id: "a1", family: "A", fileName: "a.ttf", where: "device" as const },
    ]),
  ).toBe("");
  expect(fontFaceCss("serif", [])).toBe("");
});

it("adds and removes system fonts", async () => {
  const font = addSystemFont("  Noto Serif ");
  expect(store.getState().customFonts).toEqual([
    { id: font.id, family: "Noto Serif", fileName: "", where: "device" },
  ]);
  await removeFont(font.id);
  expect(store.getState().customFonts).toEqual([]);
});

it("sets the font of a book to a font added", () => {
  const customFonts = [
    { id: "a1", family: "Wen Kai", fileName: "", where: "device" as const },
  ];
  const css = bookStyles(
    { ...DEFAULT_READER_SETTINGS, font: "custom:a1" },
    themeColors(false),
    "auto",
    customFonts,
  );
  expect(css).toContain("font-family: 'Wen Kai';");
});

describe("a font for CJK text", () => {
  const customFonts = [
    { id: "a1", family: "Wen Kai", fileName: "", where: "device" as const },
  ];

  it("goes after a font, before the CJK fonts of a generic stack", () => {
    expect(fontFamilyWithCjk("Sniglet", "custom:a1", customFonts)).toBe(
      "'Sniglet', 'Wen Kai'",
    );
    expect(fontFamilyWithCjk("serif", "system:LXGW WenKai")).toBe(
      "'Literata', 'Georgia', 'Noto Serif', 'LXGW WenKai', 'Songti SC', 'Noto Serif CJK SC', serif",
    );
    expect(
      fontFamilyWithCjk("monospace", "system:X").endsWith("'X', monospace"),
    ).toBe(true);
    expect(fontFamilyWithCjk("Sniglet", "")).toBe("'Sniglet'");
    expect(fontFamilyWithCjk("book", "system:X")).toBe("'X'");
    expect(fontFamilyWithCjk("book", "")).toBe("");
  });

  it("goes before the generic family of the default font of a view", () => {
    expect(fontFamilyWithCjk("", "system:X", [], "'Ubuntu', sans-serif")).toBe(
      "'Ubuntu', 'X', sans-serif",
    );
    expect(fontFamilyWithCjk("", "system:X", [], "monospace")).toBe(
      "'X', monospace",
    );
    expect(fontFamilyWithCjk("", "system:X", [], "'A', 'B'")).toBe(
      "'A', 'B', 'X'",
    );
    expect(fontFamilyWithCjk("", "", [], "monospace")).toBe("monospace");
    // a font chosen but gone: the default font of the view
    expect(fontFamilyWithCjk("custom:gone", "system:X", [], "serif")).toBe(
      "'X', serif",
    );
  });

  it("is set where the book sets no font, when the font is of the book", () => {
    const css = bookStyles(
      { ...DEFAULT_READER_SETTINGS, cjkFont: "custom:a1" },
      themeColors(false),
      "auto",
      customFonts,
    );
    expect(css).toContain("font-family: 'Wen Kai';");
    expect(css).not.toContain("font-family: inherit !important");
  });

  it("follows a font chosen, on all the text", () => {
    const css = bookStyles(
      { ...DEFAULT_READER_SETTINGS, font: "Sniglet", cjkFont: "custom:a1" },
      themeColors(false),
      "auto",
      customFonts,
    );
    expect(css).toContain("font-family: 'Sniglet', 'Wen Kai';");
    expect(css).toContain("font-family: inherit !important");
  });
});

describe("in the workspace", () => {
  /** files of the workspace, as the mocked commands see them */
  let files: Record<string, number[]>;

  beforeEach(() => {
    files = {};
    store.setState({
      initDir: "/ws",
      layout: "workspace",
      customFonts: [],
      workspaceFonts: [],
    });
    vi.stubGlobal(
      "FontFace",
      class {
        load = () => Promise.resolve(this);
      },
    );
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      const a = args as Record<string, unknown>;
      const path = a.filePath as string;
      if (cmd === "write_file_bytes") {
        files[path] = a.data as number[];
        return true;
      }
      if (cmd === "read_file_bytes") return files[path];
      if (cmd === "write_file") {
        files[path] = [...new TextEncoder().encode(a.text as string)];
        return true;
      }
      if (cmd === "delete_files") {
        for (const p of a.paths as string[]) delete files[p];
        return true;
      }
      return undefined;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const listed = () =>
    JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(files["/ws/.mdsilo/fonts.json"] ?? []),
      ),
    );

  it("moves an imported font to the workspace and back", async () => {
    const font = await importFont(
      new File([new Uint8Array([1, 2, 3])], "Wen_Kai.ttf"),
    );
    expect(font.where).toBe("device");

    const there = await moveTo(fonts, font, "workspace");
    expect(files["/ws/.mdsilo/fonts/Wen_Kai.ttf"]).toEqual([1, 2, 3]);
    expect(listed()).toEqual([
      { id: font.id, family: "Wen Kai", fileName: "Wen_Kai.ttf" },
    ]);
    expect(store.getState().customFonts).toEqual([]);
    expect(allFonts(store.getState())).toEqual([there]);

    await moveTo(fonts, there, "device");
    expect(files["/ws/.mdsilo/fonts/Wen_Kai.ttf"]).toBeUndefined();
    expect(listed()).toEqual([]);
    expect(store.getState().customFonts).toEqual([
      { ...font, where: "device" },
    ]);
    // the bytes are back on this device: they go to the workspace again
    await moveTo(fonts, store.getState().customFonts[0], "workspace");
    expect(files["/ws/.mdsilo/fonts/Wen_Kai.ttf"]).toEqual([1, 2, 3]);
  });

  it("gives a file of its own to a font of the same file name", async () => {
    const a = await importFont(new File([new Uint8Array([1])], "x.ttf"));
    const b = await importFont(new File([new Uint8Array([2])], "x.ttf"));
    await moveTo(fonts, a, "workspace");
    const moved = await moveTo(fonts, b, "workspace");
    expect(moved.fileName).toBe(`x-${b.id.slice(0, 8)}.ttf`);
    expect(files["/ws/.mdsilo/fonts/x.ttf"]).toEqual([1]);
    expect(files[`/ws/.mdsilo/fonts/${moved.fileName}`]).toEqual([2]);
  });

  it("removes a font of the workspace with its file", async () => {
    const font = await importFont(new File([new Uint8Array([1])], "x.ttf"));
    await moveTo(fonts, font, "workspace");
    await removeFont(font.id);
    expect(files["/ws/.mdsilo/fonts/x.ttf"]).toBeUndefined();
    expect(allFonts(store.getState())).toEqual([]);
  });

  it("moves a system font by its name only", async () => {
    const font = addSystemFont("Noto Serif");
    await moveTo(fonts, font, "workspace");
    expect(listed()).toEqual([
      { id: font.id, family: "Noto Serif", fileName: "" },
    ]);
    expect(Object.keys(files)).toEqual(["/ws/.mdsilo/fonts.json"]);
  });

  it("can not move to the workspace without one", async () => {
    const font = addSystemFont("Noto Serif");
    store.setState({ initDir: "" });
    await expect(moveTo(fonts, font, "workspace")).rejects.toThrow(
      "No workspace",
    );
    expect(store.getState().customFonts).toEqual([font]);
  });
});

it("lists no system fonts on the web", async () => {
  expect(await listSystemFonts()).toEqual([]);
  expect(invoke).not.toHaveBeenCalledWith("system_fonts");
});
