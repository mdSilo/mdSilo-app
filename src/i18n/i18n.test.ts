import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import es from "./locales/es.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import {
  getLocale,
  LANGUAGES,
  resolveLanguage,
  setLanguage,
  t,
  tk,
  tn,
  tr,
} from "./index";

afterEach(async () => {
  await setLanguage("en");
});

describe("resolveLanguage", () => {
  it("takes a language of the list as it is", () => {
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("zh-TW")).toBe("zh-TW");
  });

  it("follows the system: the first language it has", () => {
    expect(resolveLanguage("system", ["fr-FR", "es-MX", "en"])).toBe("es");
    expect(resolveLanguage("system", ["zh-Hant-HK"])).toBe("zh-TW");
    expect(resolveLanguage("system", ["zh-HK"])).toBe("zh-TW");
    expect(resolveLanguage("system", ["zh"])).toBe("zh-CN");
    expect(resolveLanguage("system", ["zh-Hans-SG"])).toBe("zh-CN");
  });

  it("is English otherwise", () => {
    expect(resolveLanguage("system", ["fr", "de"])).toBe("en");
    expect(resolveLanguage("system", [])).toBe("en");
  });
});

describe("t", () => {
  it("is the key in English, with the params in it", () => {
    expect(t("Settings")).toBe("Settings");
    expect(t("Saved as {name}", { name: "a.epub" })).toBe("Saved as a.epub");
    // a param not given stays as it is
    expect(t("Saved as {name}")).toBe("Saved as {name}");
  });

  it("translates once the language is set", async () => {
    await setLanguage("zh-CN");
    expect(getLocale()).toBe("zh-CN");
    expect(t("Settings")).toBe("设置");
    expect(tn("{count} note", "{count} notes", 2)).toBe("2 篇笔记");
    await setLanguage("es");
    expect(t("Settings")).toBe("Ajustes");
  });

  it("takes one or other by the count", () => {
    expect(tn("{count} note", "{count} notes", 1)).toBe("1 note");
    expect(tn("{count} note", "{count} notes", 3)).toBe("3 notes");
  });

  it("puts elements in the text with tr", () => {
    const html = renderToStaticMarkup(
      createElement(
        "p",
        null,
        tr("Use {code} to skip", { code: createElement("code", null, "x") }),
      ),
    );
    expect(html).toBe("<p>Use <code>x</code> to skip</p>");
  });

  it("marks a key with tk, as it is", () => {
    expect(tk("Explorer")).toBe("Explorer");
  });
});

describe("the locale files", () => {
  const files: [string, Record<string, string>][] = [
    ["es", es],
    ["zh-CN", zhCN],
    ["zh-TW", zhTW],
  ];

  it("are the languages of the list", () => {
    expect(LANGUAGES.map(([code]) => code).sort()).toEqual(
      ["en", ...files.map(([code]) => code)].sort(),
    );
  });

  it.each(files)("%s has the same keys as the others", (_, dict) => {
    expect(Object.keys(dict).sort()).toEqual(Object.keys(es).sort());
  });

  it.each(files)("%s keeps the {params} of each key", (_, dict) => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(dict)) {
      if (value) expect([key, params(value)]).toEqual([key, params(key)]);
    }
  });
});
