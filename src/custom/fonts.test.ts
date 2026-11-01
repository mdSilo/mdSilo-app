import "fake-indexeddb/auto";
import { store } from "@/state/store";
import { DEFAULT_READER_SETTINGS } from "@/reader/settings";
import { bookStyles, themeColors } from "@/reader/styles";
import {
  addSystemFont,
  familyOfFile,
  fontFaceCss,
  fontFamilyOf,
  removeFont,
  SANS,
  SERIF,
} from "./fonts";

describe("fontFamilyOf", () => {
  const customFonts = [
    { id: "a1", family: "Noto 'Serif'", fileName: "noto.ttf" },
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
    fontFaceCss("custom:a1", [{ id: "a1", family: "A", fileName: "a.ttf" }]),
  ).toBe("");
  expect(fontFaceCss("serif", [])).toBe("");
});

it("adds and removes system fonts", async () => {
  const font = addSystemFont("  Noto Serif ");
  expect(store.getState().customFonts).toEqual([
    { id: font.id, family: "Noto Serif", fileName: "" },
  ]);
  await removeFont(font.id);
  expect(store.getState().customFonts).toEqual([]);
});

it("sets the font of a book to a font added", () => {
  const customFonts = [{ id: "a1", family: "Wen Kai", fileName: "" }];
  const css = bookStyles(
    { ...DEFAULT_READER_SETTINGS, font: "custom:a1" },
    themeColors(false),
    "auto",
    customFonts,
  );
  expect(css).toContain("font-family: 'Wen Kai';");
});
