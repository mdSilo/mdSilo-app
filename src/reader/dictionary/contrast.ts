/**
 * The colors of a dictionary entry in a dark theme: dictionaries are made for
 * a white page (dark blue words, black text, light boxes). What is too dark
 * to read on the page is turned light, its hue kept; a light box is turned
 * dark. Pictures are left as they are (not an `invert` of it all).
 */

export type Rgb = { r: number; g: number; b: number; a: number };

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));

/** A color as `rgb()`/`rgba()` gives it, e.g. computed: `rgb(0, 0, 139)`, `rgb(0 0 139 / 50%)`. */
export function parseRgb(color: string): Rgb | undefined {
  const m = /^rgba?\(([^)]*)\)$/i.exec(color.trim());
  if (!m) return undefined;
  const parts = m[1]
    .replace(/\s*\/\s*/, " / ")
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3) return undefined;
  const channel = (p: string) =>
    p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p);
  const [r, g, b] = parts.slice(0, 3).map(channel);
  const alpha = parts[3];
  const a =
    alpha === undefined
      ? 1
      : alpha.endsWith("%")
        ? parseFloat(alpha) / 100
        : parseFloat(alpha);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return undefined;
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: clamp(a, 0, 1) };
}

let canvas: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS color as rgb: `rgb()` read as is; others (e.g. `oklch()` of the
 * theme) drawn on a pixel and read back. Undefined if it cannot be told.
 */
export function toRgb(color: string): Rgb | undefined {
  const rgb = parseRgb(color);
  if (rgb || !color || color === "transparent") return rgb;
  try {
    canvas ??= document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
  } catch {
    canvas = null;
  }
  if (!canvas) return undefined;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = "#000";
  canvas.fillStyle = color;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/** The relative luminance (WCAG). */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The contrast ratio of two colors (WCAG), 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl({ r, g, b }: Rgb) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rr
      ? (gg - bb) / d + (gg < bb ? 6 : 0)
      : max === gg
        ? (bb - rr) / d + 2
        : (rr - gg) / d + 4;
  return { h: h / 6, s, l };
}

function fromHsl(h: number, s: number, l: number, a: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v, a };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return {
    r: Math.round(hue(h + 1 / 3) * 255),
    g: Math.round(hue(h) * 255),
    b: Math.round(hue(h - 1 / 3) * 255),
    a,
  };
}

/** The color with its lightness turned over, hue and saturation kept: dark blue → light blue. */
export function flipLightness(color: Rgb): Rgb {
  const { h, s, l } = toHsl(color);
  return fromHsl(h, s, 1 - l, color.a);
}

const mixWhite = (c: Rgb, t: number): Rgb => ({
  r: Math.round(c.r + (255 - c.r) * t),
  g: Math.round(c.g + (255 - c.g) * t),
  b: Math.round(c.b + (255 - c.b) * t),
  a: c.a,
});

/** A text color readable on a dark background: turned light, then lighter until it is. */
export function readableOn(color: Rgb, background: Rgb, min = 4.5): Rgb {
  if (contrast(color, background) >= min) return color;
  let light = flipLightness(color);
  for (let t = 0.2; contrast(light, background) < min && t <= 1; t += 0.2)
    light = mixWhite(flipLightness(color), t);
  return light;
}

export const cssOf = ({ r, g, b, a }: Rgb) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

/** The background a box is seen on: its own if it has one, else of its parents; the page's at last. */
function backgroundOf(el: Element | null, stop: Element, page: Rgb): Rgb {
  for (let e = el; e; e = e.parentElement) {
    const bg = toRgb(getComputedStyle(e).backgroundColor);
    if (bg && bg.a >= 0.5) return bg;
    if (e === stop) break;
  }
  return page;
}

/** The background of the page an element is on, in the app (a theme color). */
export function pageBackground(el: Element | null): Rgb | undefined {
  for (let e = el; e; e = e.parentElement) {
    const bg = toRgb(getComputedStyle(e).backgroundColor);
    if (bg && bg.a >= 0.5) return bg;
  }
  return undefined;
}

const SKIP = new Set(["IMG", "SVG", "VIDEO", "PICTURE", "CANVAS", "STYLE"]);

/**
 * The colors of an entry made readable on a dark page: light boxes darkened,
 * then text too dark on what it is on turned light. Set as the element's own
 * style, `!important`, over the dictionary's.
 */
export function adaptToDark(root: Element, page: Rgb) {
  const elements = [root, ...root.querySelectorAll("*")].filter(
    (el) => !SKIP.has(el.tagName.toUpperCase()) && !el.closest("svg"),
  ) as HTMLElement[];
  for (const el of elements) {
    const bg = toRgb(getComputedStyle(el).backgroundColor);
    if (bg && bg.a >= 0.5 && luminance(bg) > 0.4)
      el.style.setProperty(
        "background-color",
        cssOf(flipLightness(bg)),
        "important",
      );
  }
  for (const el of elements) {
    const color = toRgb(getComputedStyle(el).color);
    if (!color || color.a === 0) continue;
    const solid = { ...color, a: 1 };
    const on = backgroundOf(el, root, page);
    if (contrast(solid, on) < 4.5)
      el.style.setProperty("color", cssOf(readableOn(solid, on)), "important");
  }
}
