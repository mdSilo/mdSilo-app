import {
  LENS_SIZE,
  lensColorOf,
  lensLineHeight,
  lensStyles,
} from "./lensStyles";

const PAGE = { fg: "#1f2328", primary: "#2563eb", dark: false };

describe("the look of the word lens", () => {
  test("the room under the lines grows with the line height and the gloss size", () => {
    expect(lensLineHeight(1.6, 0.6)).toBe(2.41);
    expect(lensLineHeight(1.6, 0.9)).toBeGreaterThan(lensLineHeight(1.6, 0.6));
    expect(lensLineHeight(2, 0.6)).toBeGreaterThan(lensLineHeight(1.6, 0.6));
  });

  test("the gloss right under the word, in its own em", () => {
    const css = lensStyles(
      { lineHeight: 1.6, lensSize: 0.6, lensColor: "accent" },
      PAGE,
    );
    // -0.1 of the text, in the em of a gloss of 0.6
    expect(css).toContain("inset-block-start: calc(100% + -0.17em)");
    expect(css).toContain("font-size: 0.6em");
    // a size out of bounds: within them
    expect(
      lensStyles({ lineHeight: 1.6, lensSize: 3, lensColor: "accent" }, PAGE),
    ).toContain(`font-size: ${LENS_SIZE.max}em`);
  });

  test("colors: the accent, gray of the text, others readable on light and dark pages", () => {
    expect(lensColorOf("accent", PAGE)).toBe("#2563eb");
    expect(lensColorOf("gray", PAGE)).toBe(
      "color-mix(in srgb, #1f2328 60%, transparent)",
    );
    expect(lensColorOf("red", PAGE)).toBe("#b42318");
    expect(lensColorOf("red", { ...PAGE, dark: true })).toBe("#ff8f85");
  });
});
