import {
  adaptToDark,
  contrast,
  flipLightness,
  luminance,
  parseRgb,
  readableOn,
  type Rgb,
} from "./contrast";

const rgb = (r: number, g: number, b: number, a = 1): Rgb => ({ r, g, b, a });
const DARK = rgb(29, 35, 42);
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(0, 0, 0);

describe("contrast", () => {
  test("colors as computed", () => {
    expect(parseRgb("rgb(0, 0, 139)")).toEqual(rgb(0, 0, 139));
    expect(parseRgb("rgba(10, 20, 30, 0.5)")).toEqual(rgb(10, 20, 30, 0.5));
    expect(parseRgb("rgb(10 20 30 / 50%)")).toEqual(rgb(10, 20, 30, 0.5));
    expect(parseRgb("rgb(100%, 0%, 0%)")).toEqual(rgb(255, 0, 0));
    expect(parseRgb("oklch(0.2 0.1 200)")).toBeUndefined();
    expect(parseRgb("rgb(1, 2)")).toBeUndefined();
  });

  test("luminance, contrast (WCAG)", () => {
    expect(luminance(WHITE)).toBeCloseTo(1);
    expect(luminance(BLACK)).toBe(0);
    expect(contrast(WHITE, BLACK)).toBeCloseTo(21);
    expect(contrast(BLACK, WHITE)).toBeCloseTo(21);
    expect(contrast(DARK, DARK)).toBe(1);
  });

  test("the lightness turned over, the hue kept", () => {
    const blue = flipLightness(rgb(0, 0, 139)); // darkblue
    expect(blue.b).toBeGreaterThan(200);
    expect(blue.b).toBeGreaterThan(blue.r);
    expect(flipLightness(BLACK)).toEqual(WHITE);
    expect(flipLightness(rgb(0, 0, 0, 0.5)).a).toBe(0.5);
  });

  test("readable on a dark page: made light enough; light ones kept", () => {
    for (const c of [
      rgb(0, 0, 139),
      rgb(0, 100, 0),
      rgb(128, 128, 128),
      BLACK,
      rgb(139, 0, 0),
    ]) {
      const light = readableOn(c, DARK);
      expect(contrast(light, DARK)).toBeGreaterThanOrEqual(4.5);
    }
    const light = rgb(200, 220, 255);
    expect(readableOn(light, DARK)).toBe(light);
  });

  test("an entry on a dark page: dark text light, light boxes dark, pictures kept", () => {
    document.body.innerHTML = `<div id="e">
      <b id="blue" style="color: rgb(0, 0, 139)">take</b>
      <i id="ok" style="color: rgb(200, 220, 255)">fine</i>
      <div id="box" style="background-color: rgb(255, 255, 230); color: rgb(0, 0, 0)">note</div>
      <img id="pic" style="background-color: rgb(255, 255, 255)">
    </div>`;
    const el = (id: string) => document.getElementById(id)!;
    adaptToDark(el("e"), DARK);
    const color = (id: string) => parseRgb(getComputedStyle(el(id)).color)!;
    expect(contrast(color("blue"), DARK)).toBeGreaterThanOrEqual(4.5);
    expect(el("blue").style.getPropertyPriority("color")).toBe("important");
    expect(el("ok").style.getPropertyPriority("color")).toBe("");
    const box = parseRgb(el("box").style.backgroundColor)!;
    expect(luminance(box)).toBeLessThan(0.1);
    // its text: readable on the box as it is now
    expect(contrast(color("box"), box)).toBeGreaterThanOrEqual(4.5);
    expect(el("pic").style.backgroundColor).toBe("rgb(255, 255, 255)");
  });
});
