import {
  addSite,
  DEFAULT_DICTIONARY_SETTINGS,
  enabledSources,
  forgetSource,
  isEnabled,
  isLookupText,
  moveSource,
  orderedSources,
  setEnabled,
  withDictionaryDefaults,
} from "./dictionary";
import { hasKeyPlace, isUrlTemplate, urlOfTemplate } from "./web";

const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("dictionary sources", () => {
  test("the defaults: all built in, Wiktionary and Wikipedia on", () => {
    const settings = withDictionaryDefaults();
    expect(ids(orderedSources(settings))).toEqual([
      "wiktionary",
      "wikipedia",
      "urban",
      "merriam-webster",
      "google",
    ]);
    expect(ids(enabledSources(settings))).toEqual(["wiktionary", "wikipedia"]);
  });

  test("a dictionary no longer offered, in the settings of an older app: left out", () => {
    const settings = withDictionaryDefaults({
      order: ["free-dictionary", "urban"],
      enabled: { "free-dictionary": true, urban: true },
    });
    expect(ids(enabledSources(settings))).toEqual([
      "urban",
      "wiktionary",
      "wikipedia",
    ]);
  });

  test("looked up: a word or a few", () => {
    expect(isLookupText(" cold ")).toBe(true);
    expect(isLookupText("the Old Man and the Sea")).toBe(true);
    expect(isLookupText("one two three four five six seven")).toBe(false);
    expect(isLookupText("  ")).toBe(false);
  });

  test("turned on and off; reordered; those not ordered go after", () => {
    let settings = setEnabled(DEFAULT_DICTIONARY_SETTINGS, "urban", true);
    settings = setEnabled(settings, "wiktionary", false);
    expect(isEnabled(settings, "urban")).toBe(true);
    expect(isEnabled(settings, "wiktionary")).toBe(false);
    const all = orderedSources(settings);
    settings = moveSource(settings, all, "urban", 0);
    expect(ids(enabledSources(settings))).toEqual(["urban", "wikipedia"]);
    // an order of an older app: the new ones after it
    expect(
      ids(orderedSources({ ...settings, order: ["google", "urban"] })),
    ).toEqual([
      "google",
      "urban",
      "wiktionary",
      "wikipedia",
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

  test("a site with an API key: needs %KEY%; looked up in the app, the key not shown", () => {
    expect(() =>
      addSite(DEFAULT_DICTIONARY_SETTINGS, "x", "https://x.com/%WORD%", "k"),
    ).toThrow("%KEY%");
    const settings = addSite(
      DEFAULT_DICTIONARY_SETTINGS,
      "Learner's",
      "https://x.com/json/%WORD%?key=%KEY%",
      " secret ",
    );
    expect(settings.sites[0].key).toBe("secret");
    expect(settings.sites[0].url).toBe("https://x.com/json/%WORD%?key=%KEY%");
    const site = enabledSources(settings).at(-1)!;
    expect(site).toMatchObject({ label: "Learner's", kind: "web" });
    expect(site.lookup).toBeDefined();
    expect(site.description).not.toContain("secret");
    expect(site.url!("cold")).toBe("https://x.com/json/cold?key=secret");
    // no key: a link, its place for the key left empty
    const noKey = addSite(
      DEFAULT_DICTIONARY_SETTINGS,
      "",
      "https://x.com/%WORD%?key=%KEY%",
      "  ",
    );
    expect(noKey.sites[0].key).toBeUndefined();
    const link = enabledSources(noKey).at(-1)!;
    expect(link).toMatchObject({ label: "x.com", kind: "link" });
    expect(link.url!("cold")).toBe("https://x.com/cold?key=");
  });

  test("url templates", () => {
    expect(hasKeyPlace("https://a.com/?k=%KEY%")).toBe(true);
    expect(hasKeyPlace("https://a.com/?k=%25key%25")).toBe(true);
    expect(hasKeyPlace("https://a.com/?q=%WORD%")).toBe(false);
    expect(urlOfTemplate("https://a.com/%WORD%?k=%25KEY%25", "a", "x/y")).toBe(
      "https://a.com/a?k=x%2Fy",
    );
    expect(isUrlTemplate("https://a.com/?q=%WORD%")).toBe(true);
    expect(isUrlTemplate("https://a.com/?q=%25WORD%25")).toBe(true);
    expect(isUrlTemplate("https://a.com/")).toBe(false);
    expect(isUrlTemplate("javascript:%WORD%")).toBe(false);
    expect(urlOfTemplate("https://a.com/%word%/%25WORD%25", "a&b")).toBe(
      "https://a.com/a%26b/a%26b",
    );
  });
});
