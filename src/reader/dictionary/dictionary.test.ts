import {
  addSite,
  DEFAULT_DICTIONARY_SETTINGS,
  enabledSources,
  forgetSource,
  isEnabled,
  moveSource,
  orderedSources,
  setEnabled,
  withDictionaryDefaults,
} from "./dictionary";
import { isUrlTemplate, urlOfTemplate } from "./web";

const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("dictionary sources", () => {
  test("the defaults: all built in, Wiktionary and Free Dictionary on", () => {
    const settings = withDictionaryDefaults();
    expect(ids(orderedSources(settings))).toEqual([
      "wiktionary",
      "free-dictionary",
      "urban",
      "merriam-webster",
      "google",
    ]);
    expect(ids(enabledSources(settings))).toEqual([
      "wiktionary",
      "free-dictionary",
    ]);
  });

  test("turned on and off; reordered; those not ordered go after", () => {
    let settings = setEnabled(DEFAULT_DICTIONARY_SETTINGS, "urban", true);
    settings = setEnabled(settings, "wiktionary", false);
    expect(isEnabled(settings, "urban")).toBe(true);
    expect(isEnabled(settings, "wiktionary")).toBe(false);
    const all = orderedSources(settings);
    settings = moveSource(settings, all, "urban", 0);
    expect(ids(enabledSources(settings))).toEqual(["urban", "free-dictionary"]);
    // an order of an older app: the new ones after it
    expect(
      ids(orderedSources({ ...settings, order: ["google", "urban"] })),
    ).toEqual([
      "google",
      "urban",
      "wiktionary",
      "free-dictionary",
      "merriam-webster",
    ]);
    // not a dictionary: no change
    expect(moveSource(settings, all, "nope", 1)).toBe(settings);
  });

  test("Merriam-Webster: a link without a key, looked up with one", () => {
    const mw = (key?: string) =>
      orderedSources({
        ...DEFAULT_DICTIONARY_SETTINGS,
        merriamWebsterKey: key,
      }).find((s) => s.id === "merriam-webster")!;
    expect(mw().kind).toBe("link");
    expect(mw().lookup).toBeUndefined();
    expect(mw().url!("cold")).toBe(
      "https://www.merriam-webster.com/dictionary/cold",
    );
    expect(mw("k").kind).toBe("web");
    expect(mw("k").lookup).toBeDefined();
  });

  test("a site added: a link, turned on; removed", () => {
    expect(() =>
      addSite(DEFAULT_DICTIONARY_SETTINGS, "x", "https://x.com/"),
    ).toThrow(/%WORD%/);
    const settings = addSite(
      DEFAULT_DICTIONARY_SETTINGS,
      "Collins",
      "https://www.collinsdictionary.com/dictionary/english/%WORD%",
    );
    const site = enabledSources(settings).at(-1)!;
    expect(site).toMatchObject({ label: "Collins", kind: "link" });
    expect(site.id).toMatch(/^web:/);
    expect(site.url!("ice cream")).toBe(
      "https://www.collinsdictionary.com/dictionary/english/ice%20cream",
    );
    // no name: the host
    const unnamed = addSite(
      DEFAULT_DICTIONARY_SETTINGS,
      " ",
      "https://dict.example.org/?q=%WORD%",
    );
    expect(orderedSources(unnamed).at(-1)!.label).toBe("dict.example.org");
    const gone = forgetSource(
      moveSource(settings, orderedSources(settings), site.id, 0),
      site.id,
    );
    expect(ids(orderedSources(gone))).not.toContain(site.id);
    expect(gone.order).not.toContain(site.id);
    expect(gone.enabled[site.id]).toBeUndefined();
  });

  test("url templates", () => {
    expect(isUrlTemplate("https://a.com/?q=%WORD%")).toBe(true);
    expect(isUrlTemplate("https://a.com/?q=%25WORD%25")).toBe(true);
    expect(isUrlTemplate("https://a.com/")).toBe(false);
    expect(isUrlTemplate("javascript:%WORD%")).toBe(false);
    expect(urlOfTemplate("https://a.com/%word%/%25WORD%25", "a&b")).toBe(
      "https://a.com/a%26b/a%26b",
    );
  });
});
