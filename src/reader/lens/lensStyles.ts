/**
 * The look of the word lens, in the CSS of the pages (see styles.ts): the
 * room made under the lines for the glosses, their size and color. No
 * imports of the app: the styles of the pages use it.
 */

/** The class of the marker before a word glossed, see lens.ts. */
export const LENS_CLASS = "mdsilo-lens";

export type LensColor =
  "accent" | "gray" | "red" | "orange" | "green" | "blue" | "purple";

export const LENS_COLORS: LensColor[] = [
  "accent",
  "gray",
  "red",
  "orange",
  "green",
  "blue",
  "purple",
];

/** The colors of the glosses on a light page, and on a dark one: of the text, readable on the page. */
const PALETTE: Record<
  Exclude<LensColor, "accent" | "gray">,
  [string, string]
> = {
  red: ["#b42318", "#ff8f85"],
  orange: ["#b54708", "#ffb366"],
  green: ["#067647", "#75e0a7"],
  blue: ["#175cd3", "#84caff"],
  purple: ["#6941c6", "#c4b5fd"],
};

/** The gloss size, of the text: the least, the most, the default. */
export const LENS_SIZE = { min: 0.4, max: 0.9, default: 0.6 };

/** The height of a line of gloss, of its size; and some air around it. */
const GLOSS_LINE = 1.15;
const AIR = 0.12;
/** Where the gloss starts, from the bottom of the box of the word, in the em of the text. */
const NEAR = -0.1;

/**
 * The line height with the word lens on: that of the user, and room under
 * it for a line of gloss of its size; both of the font size of the text.
 */
export const lensLineHeight = (lineHeight: number, size: number) =>
  Math.round((lineHeight + size * GLOSS_LINE + AIR) * 100) / 100;

/** The color of the glosses, on the page: the accent of the page theme, gray, or one of a few. */
export function lensColorOf(
  color: LensColor,
  page: { fg: string; primary: string; dark: boolean },
): string {
  if (color === "accent") return page.primary;
  if (color === "gray")
    return `color-mix(in srgb, ${page.fg} 60%, transparent)`;
  const [light, dark] = PALETTE[color] ?? PALETTE.blue;
  return page.dark ? dark : light;
}

/**
 * The CSS of the glosses: right under the word (beside it, written down the
 * page), from its start; the room under the line (see lensLineHeight) keeps
 * it off the next line.
 * The marker is empty: its box is the height of the text; the gloss is its
 * `::after`, its `em` the size of the gloss.
 */
export function lensStyles(
  settings: { lineHeight: number; lensSize: number; lensColor: LensColor },
  page: { fg: string; primary: string; dark: boolean },
): string {
  const size = Math.min(
    LENS_SIZE.max,
    Math.max(LENS_SIZE.min, settings.lensSize || LENS_SIZE.default),
  );
  // right under the word: its box ends below the letters (room for the
  // descenders, empty under most), the gloss a little into it; in the em of
  // the gloss
  const offset = Math.round((NEAR / size) * 100) / 100;
  return `
    .${LENS_CLASS} { position: relative; }
    .${LENS_CLASS}::after {
      content: attr(data-gloss);
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: calc(100% + ${offset}em);
      font-size: ${size}em;
      line-height: ${GLOSS_LINE};
      color: ${lensColorOf(settings.lensColor, page)};
      font-style: normal;
      font-weight: normal;
      text-indent: 0;
      letter-spacing: normal;
      text-decoration: none;
      white-space: nowrap;
      max-inline-size: ${Math.round(8 / size)}em;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
    }`;
}
