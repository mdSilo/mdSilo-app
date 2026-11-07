import { ask } from "@tauri-apps/plugin-dialog";
import { updateDictionariesGitignore } from "@/workspace/gitignore";
import {
  groupDictionaryFiles,
  importDictionaries,
  readDictionaryList,
  removeDictionary,
  renameDictionary,
  resetLocalDictionaries,
  setDictionarySynced,
  useLocalDictionaries,
} from "./local";
import {
  followLinks,
  lookupMdict,
  mimeOf,
  prepareEntry,
  titleOf,
} from "./mdict";
import { fixture, fixtureFile, mockFs } from "./testFs";

const WS = "/ws";
const LIST = "/ws/.mdsilo/dictionaries.json";
const IGNORE = "/ws/.mdsilo/dictionaries/.gitignore";

beforeEach(() => resetLocalDictionaries());

const names = (files: { name: string }[]) => files.map((f) => f.name);

describe("dictionary files", () => {
  test("grouped by name: an .mdx with its .mdd (in parts) and .css", () => {
    const { groups, left } = groupDictionaryFiles(
      [
        "Oxford.mdx",
        "oxford.2.mdd",
        "Oxford.1.mdd",
        "oxford.css",
        "Collins.mdx",
        "other.mdd",
        "notes.txt",
      ].map((name) => ({ name })),
    );
    expect(groups.map((g) => g.stem)).toEqual(["oxford", "collins"]);
    expect(names(groups[0].mdd)).toEqual(["Oxford.1.mdd", "oxford.2.mdd"]);
    expect(names(groups[0].css)).toEqual(["oxford.css"]);
    expect(groups[1].mdd).toEqual([]);
    expect(names(left)).toEqual(["other.mdd", "notes.txt"]);
  });

  test("the .gitignore: all folders but those synced, the rest of the file kept", () => {
    const text = updateDictionariesGitignore("my-rule\n", ["b", "a*"]);
    expect(text).toBe(
      "my-rule\n\n# >>> mdSilo: dictionary files are not synced, unless chosen in the dictionaries\n/*/\n!/a\\*/\n!/b/\n# <<< mdSilo\n",
    );
    expect(updateDictionariesGitignore(text, [])).toBe(
      "my-rule\n\n# >>> mdSilo: dictionary files are not synced, unless chosen in the dictionaries\n/*/\n# <<< mdSilo\n",
    );
  });

  test("imported (web: the files themselves), checked, listed, not synced", async () => {
    const files = mockFs();
    const { added, failed } = await importDictionaries(WS, [
      { name: "mdict-en-en.mdx", file: fixtureFile("mdict-en-en.mdx") },
      { name: "mdict-en-en.mdd", file: fixtureFile("mdict-en-en.mdd") },
      { name: "stray.mdd", file: new File(["x"], "stray.mdd") },
    ]);
    expect(failed).toEqual([
      { name: "stray.mdd", error: "No .mdx of the same name" },
    ]);
    const [dict] = added;
    // the title the dictionary gives
    expect(dict.name).toBe("Longman Phrasal Verbs Dictionary 2nd Edition");
    expect(dict).toMatchObject({
      kind: "mdict",
      files: { mdx: "mdict-en-en.mdx", mdd: ["mdict-en-en.mdd"] },
      size:
        fixture("mdict-en-en.mdx").length + fixture("mdict-en-en.mdd").length,
      biggest: fixture("mdict-en-en.mdx").length,
    });
    expect(dict.synced).toBeUndefined();
    expect(
      files.has(`/ws/.mdsilo/dictionaries/${dict.id}/mdict-en-en.mdx`),
    ).toBe(true);
    expect(await readDictionaryList(WS)).toEqual([dict]);
    expect(files.get(IGNORE)).toContain("/*/\n# <<< mdSilo");
    expect(useLocalDictionaries.getState()).toMatchObject({
      ws: WS,
      list: [dict],
      here: { [dict.id]: true },
    });
  });

  test("imported (desktop: by path); a file that is no dictionary removed again", async () => {
    const files = mockFs(new Map(), {
      "/dl/Longman.mdx": fixture("mdict-en-en.mdx"),
      "/dl/Bad.mdx": new TextEncoder().encode("not a dictionary"),
    });
    const { added, failed } = await importDictionaries(WS, [
      { name: "Longman.mdx", path: "/dl/Longman.mdx" },
      { name: "Bad.mdx", path: "/dl/Bad.mdx" },
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].size).toBe(fixture("mdict-en-en.mdx").length);
    expect(names(failed)).toEqual(["Bad.mdx"]);
    // nothing of it left
    const dirs = new Set(
      [...files.keys()]
        .filter(
          (p) =>
            p.startsWith("/ws/.mdsilo/dictionaries/") &&
            !p.endsWith(".gitignore"),
        )
        .map((p) => p.split("/")[4]),
    );
    expect([...dirs]).toEqual([added[0].id]);
  });

  test("synced (a big one asked first), renamed, removed", async () => {
    const files = mockFs();
    const { added } = await importDictionaries(WS, [
      { name: "a.mdx", file: fixtureFile("mdict-en-en.mdx") },
    ]);
    const dict = added[0];
    expect(await setDictionarySynced(WS, dict, true)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(files.get(IGNORE)).toContain(`!/${dict.id}/`);
    expect((await readDictionaryList(WS))[0].synced).toBe(true);

    // big: asked; no
    vi.mocked(ask).mockResolvedValueOnce(false);
    const big = { ...dict, synced: false, biggest: 120 * 1024 * 1024 };
    await setDictionarySynced(WS, { ...dict, synced: false }, false);
    expect(await setDictionarySynced(WS, big, true)).toBe(false);
    expect(vi.mocked(ask).mock.calls[0][0]).toMatch(
      /Edition \(120 MB\)[\s\S]*GitHub refuses a file over 100 MB/,
    );
    expect(files.get(IGNORE)).not.toContain(`!/${dict.id}/`);

    await renameDictionary(WS, dict.id, " Mine ");
    expect(useLocalDictionaries.getState().list[0].name).toBe("Mine");
    await removeDictionary(WS, dict.id);
    expect(await readDictionaryList(WS)).toEqual([]);
    expect([...files.keys()].some((p) => p.includes(`/${dict.id}/`))).toBe(
      false,
    );
  });

  test("not on this device: listed, not here", async () => {
    const files = mockFs(
      new Map([
        [
          LIST,
          JSON.stringify({
            version: 1,
            dictionaries: [
              {
                id: "x",
                name: "Synced elsewhere",
                kind: "mdict",
                files: { mdx: "x.mdx" },
                size: 1,
                biggest: 1,
                addedAt: "",
              },
            ],
          }),
        ],
      ]),
    );
    await useLocalDictionaries.getState().load(WS);
    expect(useLocalDictionaries.getState().here).toEqual({ x: false });
    files.set("/ws/.mdsilo/dictionaries/x/x.mdx", "...");
    await useLocalDictionaries.getState().load(WS);
    expect(useLocalDictionaries.getState().here).toEqual({ x: true });
  });
});

describe("mdict", () => {
  test("looked up: as written, else in lower case; not found", async () => {
    mockFs();
    const { added } = await importDictionaries(WS, [
      { name: "a.mdx", file: fixtureFile("mdict-en-en.mdx") },
    ]);
    const res = await lookupMdict(WS, added[0], "Rabbit");
    expect(res.word).toBe("Rabbit");
    expect(res.entries).toEqual([]);
    expect(res.html).toContain("rabbit on");
    // its links to entries marked
    const abide = await lookupMdict(WS, added[0], "abide");
    expect(abide.html).toContain('data-mdict-entry="stick to"');
    expect(abide.html).not.toContain("entry://");
    expect((await lookupMdict(WS, added[0], "zzzz")).html).toBeUndefined();
  });

  test("links to other entries followed", async () => {
    const entries: Record<string, string> = {
      colour: "@@@LINK=color\r\n",
      color: "<b>color</b>\0",
      loop: "@@@LINK=loop",
    };
    const mdx = {
      lookup: async (w: string) => ({
        keyText: w,
        definition: entries[w] ?? null,
      }),
    };
    expect(await followLinks(mdx as never, "colour")).toBe("<b>color</b>");
    expect(await followLinks(mdx as never, "loop")).toBeUndefined();
    expect(await followLinks(mdx as never, "nope")).toBeUndefined();
  });

  test("an entry prepared: sounds, entries, anchors, pictures, style sheets marked; sanitized", () => {
    const { html, pronunciations, styles } = prepareEntry(
      `<link rel="stylesheet" href="oald.css"><link rel="stylesheet" href="https://x/y.css">
      <a href="sound://uk/cold.mp3">UK</a> <a href="sound://us/cold.mp3">US</a>
      <img src="speaker.png" onclick="v0r.v(this,'E/ABC')">
      <a href="entry://chilly">chilly</a> <a href="entry://#adj">adj</a> <a href="#n">n</a>
      <a href="bword://freeze%20over">freeze over</a>
      <img src="https://x/pic.png"><span style="color:red" class="pos">adj</span>
      <script>alert(1)</script><form><input></form><iframe src="x"></iframe>`,
      "d1",
    );
    expect(styles).toEqual(["oald.css"]);
    expect(pronunciations).toEqual([
      { audio: "mdict:d1:uk/cold.mp3" },
      { audio: "mdict:d1:us/cold.mp3" },
      { audio: "mdict:d1:E/ABC" },
    ]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const sound = doc.querySelector('[data-mdict-sound="uk/cold.mp3"]');
    expect(sound?.getAttribute("href")).toBe("#");
    expect(doc.querySelector('[data-mdict-entry="chilly"]')).not.toBeNull();
    expect(
      doc.querySelector('[data-mdict-entry="freeze over"]'),
    ).not.toBeNull();
    expect(doc.querySelector('[data-mdict-anchor="adj"]')).not.toBeNull();
    expect(doc.querySelector('[data-mdict-anchor="n"]')).not.toBeNull();
    const img = doc.querySelector('img[data-mdict-src="speaker.png"]');
    expect(img?.getAttribute("src")).toBeNull();
    expect(img?.getAttribute("data-mdict-sound")).toBe("E/ABC");
    expect(img?.hasAttribute("onclick")).toBe(false);
    expect(doc.querySelector('img[src="https://x/pic.png"]')).not.toBeNull();
    // its styles kept: they apply in a shadow root
    expect(doc.querySelector("span.pos")?.getAttribute("style")).toBe(
      "color:red",
    );
    expect(html).not.toMatch(/<script|<form|<input|<iframe|<link|alert/);
  });

  test("titles, types", () => {
    expect(titleOf({ Title: "<b>Oxford</b> 10" })).toBe("Oxford 10");
    expect(titleOf({ Title: "Title (No HTML code allowed)" })).toBeUndefined();
    expect(titleOf({})).toBeUndefined();
    expect(mimeOf("a/b.MP3")).toBe("audio/mpeg");
    expect(mimeOf("x.spx")).toBe("");
  });
});
