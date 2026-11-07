import { invoke } from "@tauri-apps/api/core";
import { md5 } from "js-md5";
import {
  accentOf,
  commonsAudioUrl,
  lookupFreeDictionary,
  lookupMerriamWebster,
  lookupUrban,
  lookupWiktionaryWithAudio,
  merriamWebsterAudioUrl,
} from "./web";

const respond = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    statusText: String(status),
    json: async () => body,
  }) as Response;

const bytes = (body: unknown) =>
  new TextEncoder().encode(JSON.stringify(body)).buffer;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web dictionaries", () => {
  test("accents of recordings", () => {
    expect(accentOf("https://x/cold-uk.mp3")).toBe("UK");
    expect(accentOf("File:En-us-cold.ogg")).toBe("US");
    expect(accentOf("En-au-cold.ogg")).toBe("AU");
    expect(accentOf("LL-Q1860_(eng)-x-cold.wav")).toBeUndefined();
    expect(accentOf("cold.mp3")).toBeUndefined();
  });

  test("a file of Commons, as mp3", () => {
    const h = md5("En-us-cold.ogg");
    expect(commonsAudioUrl("File:En-us-cold.ogg")).toBe(
      `https://upload.wikimedia.org/wikipedia/commons/transcoded/${h[0]}/${h.slice(0, 2)}/En-us-cold.ogg/En-us-cold.ogg.mp3`,
    );
    // as linked, in lower case: the file is in capital
    expect(commonsAudioUrl("File:en-us-cold.ogg")).toBe(
      commonsAudioUrl("File:En-us-cold.ogg"),
    );
    const m = md5("A_b.mp3");
    expect(commonsAudioUrl("File:A b.mp3")).toBe(
      `https://upload.wikimedia.org/wikipedia/commons/${m[0]}/${m.slice(0, 2)}/A_b.mp3`,
    );
  });

  test("Wiktionary: the recordings of the language on the first entry", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list")
        ? respond({
            items: [
              { title: "File:Fr-froid.ogg", type: "audio" },
              { title: "File:En-uk-cold.ogg", type: "audio" },
              { title: "File:Cold.jpg", type: "image" },
              { title: "File:En-us-cold.ogg", type: "audio" },
            ],
          })
        : respond({
            en: [
              {
                partOfSpeech: "Adjective",
                language: "English",
                definitions: [{ definition: "Having a low temperature." }],
              },
            ],
          }),
    );
    const res = await lookupWiktionaryWithAudio("cold", "en-GB");
    expect(res.entries[0].pronunciations).toEqual([
      { audio: commonsAudioUrl("File:En-uk-cold.ogg"), label: "UK" },
      { audio: commonsAudioUrl("File:En-us-cold.ogg"), label: "US" },
    ]);
    // no recordings (or the list failing): the definitions still
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list")
        ? respond({}, 500)
        : respond({
            en: [{ partOfSpeech: "Noun", definitions: [{ definition: "x" }] }],
          }),
    );
    const plain = await lookupWiktionaryWithAudio("x");
    expect(plain.entries[0].pronunciations).toBeUndefined();
  });

  test("Wiktionary: a word capitalized, in lower case too", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("media-list/rabbit"))
        return respond({
          items: [{ title: "File:En-us-rabbit.ogg", type: "audio" }],
        });
      if (url.includes("media-list")) return respond({ items: [] });
      if (url.includes("definition/Rabbit"))
        return respond({
          en: [
            {
              partOfSpeech: "Proper noun",
              language: "English",
              definitions: [{ definition: "A name." }],
            },
          ],
        });
      return respond({
        en: [
          {
            partOfSpeech: "Noun",
            language: "English",
            definitions: [{ definition: "A mammal." }],
          },
        ],
        fr: [
          {
            partOfSpeech: "Noun",
            language: "French",
            definitions: [{ definition: "lapin" }],
          },
        ],
      });
    });
    const res = await lookupWiktionaryWithAudio("Rabbit", "en");
    expect(res.word).toBe("Rabbit");
    expect(res.entries.map((e) => e.language)).toEqual(["English", "French"]);
    expect(res.entries[0].meanings.map((m) => m.partOfSpeech)).toEqual([
      "Proper noun",
      "Noun",
    ]);
    expect(res.entries[0].pronunciations).toEqual([
      { audio: commonsAudioUrl("File:En-us-rabbit.ogg"), label: "US" },
    ]);
    // all capitals, or lower case: as written only
    fetchMock.mockClear();
    await lookupWiktionaryWithAudio("NASA");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("Free Dictionary: meanings, examples escaped, a recording per accent", async () => {
    fetchMock.mockResolvedValueOnce(
      respond([
        {
          word: "cold",
          phonetic: "/kəʊld/",
          phonetics: [
            { text: "/kəʊld/", audio: "" },
            { text: "/kɔʊld/", audio: "https://x/cold-uk.mp3" },
            { text: "/koʊld/", audio: "https://x/cold-us.mp3" },
            { audio: "https://x/cold-us.mp3" },
          ],
          meanings: [
            {
              partOfSpeech: "adjective",
              definitions: [
                {
                  definition: "Having a <low> temperature.",
                  example: "a cold day",
                },
                { definition: "" },
              ],
            },
          ],
        },
        {
          word: "cold",
          meanings: [
            { partOfSpeech: "noun", definitions: [{ definition: "A cold." }] },
          ],
        },
      ]),
    );
    const res = await lookupFreeDictionary(" cold ");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.dictionaryapi.dev/api/v2/entries/en/cold",
    );
    expect(res.word).toBe("cold");
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0].meanings[0].definitions).toEqual([
      "Having a &lt;low&gt; temperature. <i>“a cold day”</i>",
    ]);
    expect(res.entries[0].pronunciations).toEqual([
      { text: "/kɔʊld/", audio: "https://x/cold-uk.mp3", label: "UK" },
      { text: "/koʊld/", audio: "https://x/cold-us.mp3", label: "US" },
      { text: "/kəʊld/" },
    ]);
    expect(res.entries[1].pronunciations).toBeUndefined();
    // not found
    fetchMock.mockResolvedValueOnce(respond({ title: "No Definitions" }, 404));
    expect((await lookupFreeDictionary("zzz")).entries).toEqual([]);
  });

  test("Urban Dictionary: by the app host, most voted first, links as words", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) =>
      cmd === "fetch_url"
        ? bytes({
            list: [
              { definition: "low [votes]", thumbs_up: 1 },
              {
                definition: "[Heartless],\r\nno <b>emotions</b>",
                example: "that's [cold]",
                thumbs_up: 9,
                sound_urls: ["https://x/cold.mp3"],
              },
              { definition: " ", thumbs_up: 99 },
            ],
          })
        : undefined,
    );
    const res = await lookupUrban("cold");
    expect(invoke).toHaveBeenCalledWith("fetch_url", {
      url: "https://api.urbandictionary.com/v0/define?term=cold",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.url).toBe(
      "https://www.urbandictionary.com/define.php?term=cold",
    );
    expect(res.entries[0].meanings[0].definitions).toEqual([
      "Heartless,<br>no &lt;b&gt;emotions&lt;/b&gt;<br><i>that's cold</i>",
      "low votes",
    ]);
    expect(res.entries[0].pronunciations).toEqual([
      { audio: "https://x/cold.mp3" },
    ]);
    vi.mocked(invoke).mockImplementation(async () => bytes({ list: [] }));
    expect((await lookupUrban("zzz")).entries).toEqual([]);
  });

  test("Merriam-Webster: the homographs of the word, its recording", async () => {
    vi.mocked(invoke).mockImplementation(async () =>
      bytes([
        {
          meta: { id: "cold:1" },
          hwi: {
            hw: "cold",
            prs: [{ mw: "ˈkōld", sound: { audio: "cold0001" } }],
          },
          fl: "adjective",
          shortdef: ["having a low temperature"],
        },
        { meta: { id: "cold:2" }, fl: "noun", shortdef: ["bodily sensation"] },
        { meta: { id: "cold war" }, fl: "noun", shortdef: ["conflict"] },
      ]),
    );
    const res = await lookupMerriamWebster("cold", "KEY");
    expect(invoke).toHaveBeenCalledWith("fetch_url", {
      url: "https://www.dictionaryapi.com/api/v3/references/collegiate/json/cold?key=KEY",
    });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].meanings.map((m) => m.partOfSpeech)).toEqual([
      "adjective",
      "noun",
    ]);
    expect(res.entries[0].pronunciations).toEqual([
      {
        text: "\\ˈkōld\\",
        audio:
          "https://media.merriam-webster.com/audio/prons/en/us/mp3/c/cold0001.mp3",
        label: "US",
      },
    ]);
    // not found: the words like it, as strings
    vi.mocked(invoke).mockImplementation(async () => bytes(["colt", "cola"]));
    expect((await lookupMerriamWebster("coldd", "KEY")).entries).toEqual([]);
  });

  test("the folders of Merriam-Webster recordings", () => {
    const dir = (a: string) => merriamWebsterAudioUrl(a).split("/").at(-2);
    expect(dir("bixcold1")).toBe("bix");
    expect(dir("ggcold01")).toBe("gg");
    expect(dir("3d000001")).toBe("number");
    expect(dir("_cold001")).toBe("number");
    expect(dir("heart001")).toBe("h");
  });
});
