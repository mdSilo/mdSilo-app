import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { store } from "@/state/store";
import { openUrl } from "@/workspace/open";
import { resetVocabulary, useVocabulary } from "../vocabulary/vocabulary";
import DictionaryLookup from "./DictionaryLookup";
import DictionariesModal from "./DictionariesModal";
import MdictEntry from "./MdictEntry";
import Pronunciations from "./Pronunciations";
import { prepareEntry } from "./mdict";
import {
  DEFAULT_DICTIONARY_SETTINGS,
  orderedSources,
  withDictionaryDefaults,
  type DictionarySettings,
} from "./dictionary";
import {
  importDictionaries,
  resetLocalDictionaries,
  useLocalDictionaries,
} from "./local";
import { fixtureFile, mockFs } from "./testFs";
import { commonsAudioUrl } from "./web";

vi.mock("@/workspace/open", () => ({
  openUrl: vi.fn(async () => undefined),
  openFileDilog: vi.fn(async () => null),
}));

const respond = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    statusText: String(status),
    json: async () => body,
  }) as Response;

const WIKTIONARY_COLD = {
  en: [
    {
      partOfSpeech: "Adjective",
      language: "English",
      definitions: [{ definition: "Having a low temperature." }],
    },
  ],
};

const WIKIPEDIA_COLD = {
  title: "Cold",
  extract: "Cold is the presence of low temperature.",
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Cold" } },
};

/** The recordings of a word on its Wiktionary page. */
const mediaOf = (...files: string[]) => ({
  items: files.map((title) => ({ type: "audio", title: `File:${title}` })),
});

const selection = (text: string) => ({
  text,
  cfi: "epubcfi(/6/4!/4/4,/1:16,/1:20)",
  index: 1,
  box: { left: 10, top: 10, right: 50, bottom: 20 },
});

const settle = () => act(async () => {});

let fetchMock: ReturnType<typeof vi.fn>;
let plays: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  plays = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    plays.push(this.src);
    return Promise.resolve();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const setSettings = (patch: Partial<DictionarySettings>) =>
  store
    .getState()
    .setDictionarySettings({ ...DEFAULT_DICTIONARY_SETTINGS, ...patch });

describe("dictionary lookup", () => {
  test("a tab per dictionary on; the first that has the word shows; Wikipedia one of them", async () => {
    // not in Wiktionary: on to Wikipedia
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("wikipedia.org")
        ? respond(WIKIPEDIA_COLD)
        : respond({}, 404),
    );
    const onKeep = vi.fn();
    render(<DictionaryLookup selection={selection("cold")} onKeep={onKeep} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Wiktionary", "Wikipedia"]);
    expect(
      await screen.findByText("Cold is the presence of low temperature."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Wikipedia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // the article on the web, not its search
    fireEvent.click(screen.getByTitle("Open on the web"));
    expect(openUrl).toHaveBeenCalledWith("https://en.wikipedia.org/wiki/Cold");
    fireEvent.click(screen.getByText("Keep as note"));
    expect(onKeep).toHaveBeenCalledWith(
      "Cold is the presence of low temperature.",
    );
    // back to Wiktionary: looked up once, not again
    fireEvent.click(screen.getByRole("tab", { name: "Wiktionary" }));
    expect(screen.getByText("No definition of “cold”")).toBeInTheDocument();
    await settle();
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes("definition")),
    ).toHaveLength(1);
  });

  test("no Keep as note without onKeep: in a note", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list") ? respond({}) : respond(WIKTIONARY_COLD),
    );
    render(<DictionaryLookup selection={{ text: "cold" }} />);
    expect(
      await screen.findByText("Having a low temperature."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Keep as note")).toBeNull();
  });

  test("added to the vocabulary with its pronunciations and dictionary; a word kept before given them", async () => {
    resetVocabulary();
    mockFs();
    await useVocabulary
      .getState()
      .add("/ws", { word: "old", definition: "<p>aged</p>" });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list/cold")
        ? respond(mediaOf("En-us-cold.ogg"))
        : url.includes("media-list/old")
          ? respond(mediaOf("En-uk-old.mp3"))
          : url.includes("wiktionary.org")
            ? respond(WIKTIONARY_COLD)
            : respond({}, 404),
    );
    const { unmount } = render(
      <DictionaryLookup
        selection={selection("cold")}
        ws="/ws"
        onKeep={vi.fn()}
        placeOf={() => ({ book: "abc", title: "A Book" })}
      />,
    );
    fireEvent.click(await screen.findByText("Add to vocabulary"));
    await screen.findByTestId("word-kept");
    const cold = commonsAudioUrl("File:En-us-cold.ogg");
    expect(
      useVocabulary.getState().entries.find((e) => e.word === "cold"),
    ).toMatchObject({
      source: "wiktionary",
      sourceName: "Wiktionary",
      pronunciations: [{ audio: cold, label: "US" }],
      context: { book: "abc", title: "A Book" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Play the pronunciation (US)" }),
    );
    expect(plays).toEqual([cold]);
    unmount();
    render(
      <DictionaryLookup
        selection={selection("old")}
        ws="/ws"
        onKeep={vi.fn()}
      />,
    );
    await screen.findByTestId("word-kept");
    await waitFor(() =>
      expect(
        useVocabulary.getState().entries.find((e) => e.word === "old")
          ?.pronunciations,
      ).toEqual([
        { audio: commonsAudioUrl("File:En-uk-old.mp3"), label: "UK" },
      ]),
    );
  });

  test("found in the first: the others not looked up", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list") ? respond({}) : respond(WIKTIONARY_COLD),
    );
    render(<DictionaryLookup selection={selection("cold")} onKeep={vi.fn()} />);
    expect(
      await screen.findByText("Having a low temperature."),
    ).toBeInTheDocument();
    await settle();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("wikipedia")),
    ).toBe(false);
  });

  test("the order of the user; a link opens the site; none on", async () => {
    setSettings({
      order: ["google", "wiktionary"],
      enabled: { google: true, wikipedia: false },
    });
    fetchMock.mockImplementation(async () => respond(WIKTIONARY_COLD));
    const { unmount } = render(
      <DictionaryLookup selection={selection("cold")} onKeep={vi.fn()} />,
    );
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Google",
      "Wiktionary",
    ]);
    // a link is not where it starts
    expect(
      await screen.findByText("Having a low temperature."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Google" }));
    fireEvent.click(screen.getByText("Open in Google"));
    expect(openUrl).toHaveBeenCalledWith(
      "https://www.google.com/search?q=define+cold",
    );
    unmount();

    setSettings({ enabled: { wiktionary: false, wikipedia: false } });
    render(<DictionaryLookup selection={selection("cold")} onKeep={vi.fn()} />);
    expect(screen.getByText(/No dictionary is turned on/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dictionary settings"));
    expect(store.getState().isDictionariesOpen).toBe(true);
  });

  test("all failing: the error", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<DictionaryLookup selection={selection("cold")} onKeep={vi.fn()} />);
    // each tried, the last shown
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Wikipedia" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      await screen.findByText("Could not look it up: offline"),
    ).toBeInTheDocument();
  });
});

describe("dictionaries settings", () => {
  const order = () =>
    orderedSources(
      withDictionaryDefaults(store.getState().dictionarySettings),
    ).map((s) => s.id);

  test("turned on, moved, a site added and removed, a key kept", async () => {
    store.getState().setIsDictionariesOpen(true);
    render(<DictionariesModal />);
    const list = screen.getByRole("list", { name: "Dictionaries" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);

    fireEvent.click(screen.getByLabelText("Use Urban Dictionary"));
    expect(store.getState().dictionarySettings.enabled.urban).toBe(true);
    fireEvent.click(screen.getByLabelText("Use Wiktionary"));
    expect(store.getState().dictionarySettings.enabled.wiktionary).toBe(false);

    fireEvent.click(screen.getByLabelText("Move Urban Dictionary up"));
    expect(order().slice(0, 3)).toEqual(["wiktionary", "urban", "wikipedia"]);
    expect(screen.getByLabelText("Move Wiktionary up")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Move Wiktionary down"));
    expect(order().slice(0, 2)).toEqual(["urban", "wiktionary"]);

    // a site: needs %WORD%
    fireEvent.change(screen.getByLabelText("Site name"), {
      target: { value: "Collins" },
    });
    fireEvent.change(screen.getByLabelText("Site url"), {
      target: { value: "https://www.collinsdictionary.com/" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText(/needs %WORD%/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Site url"), {
      target: {
        value: "https://www.collinsdictionary.com/dictionary/english/%WORD%",
      },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Collins")).toBeInTheDocument();
    expect(screen.getByLabelText("Use Collins")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Remove Collins"));
    expect(screen.queryByText("Collins")).not.toBeInTheDocument();
    // built in: not removed
    expect(screen.queryByLabelText("Remove Google")).not.toBeInTheDocument();

    const key = screen.getByLabelText("Merriam-Webster API key");
    fireEvent.change(key, { target: { value: " abc " } });
    fireEvent.blur(key);
    expect(store.getState().dictionarySettings.merriamWebsterKey).toBe("abc");
    expect(
      within(screen.getByTestId("dictionary-merriam-webster")).getByText("Web"),
    ).toBeInTheDocument();
  });
});

describe("dictionary files", () => {
  const WS = "/ws";
  beforeEach(() => resetLocalDictionaries());

  /** The text of the entry shown, without its styles. */
  const entryText = () =>
    screen.getByTestId("mdict-entry").shadowRoot?.querySelector(".mdict-entry")
      ?.textContent ?? "";

  const importLongman = async () => {
    mockFs();
    const { added } = await importDictionaries(WS, [
      { name: "longman.mdx", file: fixtureFile("mdict-en-en.mdx") },
    ]);
    return added[0];
  };

  test("an entry of a file, in its own root; a link to another entry, and back", async () => {
    await importLongman();
    // the file first, the web ones not asked
    setSettings({ enabled: { wiktionary: false, wikipedia: false } });
    const onKeep = vi.fn();
    render(
      <DictionaryLookup
        selection={selection("abide")}
        ws={WS}
        onKeep={onKeep}
      />,
    );
    const entry = await screen.findByTestId("mdict-entry");
    await waitFor(() => expect(entryText()).toContain("abide by"));
    expect(fetchMock).not.toHaveBeenCalled();
    // the styles of the dictionary stay in it
    expect(entry.shadowRoot?.querySelector("style")?.textContent).toContain(
      "contain: paint",
    );
    const link = entry.shadowRoot!.querySelector<HTMLElement>(
      '[data-mdict-entry="stick to"]',
    )!;
    act(() => link.click());
    await waitFor(() => expect(entryText()).toMatch(/^stick to/));
    fireEvent.click(screen.getByLabelText("Back"));
    await waitFor(() => expect(entryText()).toContain("abide by"));
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
    // kept as a note: the text of the entry
    fireEvent.click(screen.getByText("Keep as note"));
    expect(onKeep.mock.calls[0][0]).toMatch(/^abide \[.*abide by/);
    expect(onKeep.mock.calls[0][0]).not.toContain("<");
  });

  test("a dark theme: the dark colors of the dictionary made light", async () => {
    await importLongman();
    setSettings({ enabled: { wiktionary: false, wikipedia: false } });
    store.setState({ darkMode: true });
    render(
      <DictionaryLookup
        selection={selection("abide")}
        ws={WS}
        onKeep={vi.fn()}
      />,
    );
    await waitFor(() => expect(entryText()).toContain("abide by"));
    const root = screen.getByTestId("mdict-entry").shadowRoot!;
    // some of its own colors, for a white page, too dark here
    await waitFor(() =>
      expect(
        [...root.querySelectorAll<HTMLElement>(".mdict-entry *")].some(
          (el) => el.style.getPropertyPriority("color") === "important",
        ),
      ).toBe(true),
    );
  });

  test("not in the file: on to the web", async () => {
    const dict = await importLongman();
    setSettings({ order: [`mdict:${dict.id}`] });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("media-list") ? respond({}) : respond(WIKTIONARY_COLD),
    );
    render(
      <DictionaryLookup
        selection={selection("cold")}
        ws={WS}
        onKeep={vi.fn()}
      />,
    );
    // the file first
    await waitFor(() =>
      expect(screen.getAllByRole("tab")[0]).toHaveTextContent(
        "Longman Phrasal Verbs",
      ),
    );
    expect(
      await screen.findByText("Having a low temperature."),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Wiktionary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("imported in the settings, put first; synced; removed", async () => {
    const files = mockFs();
    store.setState({ initDir: WS, layout: "workspace" });
    store.getState().setIsDictionariesOpen(true);
    render(<DictionariesModal />);
    fireEvent.change(screen.getByTestId("dictionary-files"), {
      target: {
        files: [fixtureFile("mdict-en-en.mdx"), new File(["x"], "lonely.mdd")],
      },
    });
    expect(
      await screen.findByText(/Imported: Longman Phrasal Verbs/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/lonely\.mdd: No \.mdx of the same name/),
    ).toBeInTheDocument();
    const [dict] = useLocalDictionaries.getState().list;
    const row = screen.getByTestId(`dictionary-mdict:${dict.id}`);
    expect(within(row).getByText("File")).toBeInTheDocument();
    expect(within(row).getByLabelText(/^Use /)).toBeChecked();
    expect(
      within(screen.getByRole("list", { name: "Dictionaries" })).getAllByRole(
        "listitem",
      )[0],
    ).toBe(row);

    // synced: small, not asked
    fireEvent.click(within(row).getByLabelText(`Sync ${dict.name}`));
    await waitFor(() =>
      expect(useLocalDictionaries.getState().list[0].synced).toBe(true),
    );
    expect(files.get("/ws/.mdsilo/dictionaries/.gitignore")).toContain(
      `!/${dict.id}/`,
    );

    const { ask } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(ask).mockResolvedValueOnce(true);
    fireEvent.click(within(row).getByLabelText(`Remove ${dict.name}`));
    await waitFor(() =>
      expect(useLocalDictionaries.getState().list).toEqual([]),
    );
    expect(vi.mocked(ask).mock.calls[0][0]).toContain(
      "and from the other devices",
    );
    expect(store.getState().dictionarySettings.order).not.toContain(
      `mdict:${dict.id}`,
    );
  });

  test("a file not on this device: shown in the settings, not in the popup", async () => {
    mockFs(
      new Map([
        [
          "/ws/.mdsilo/dictionaries.json",
          JSON.stringify({
            dictionaries: [
              {
                id: "gone",
                name: "Elsewhere",
                kind: "mdict",
                files: { mdx: "e.mdx" },
                size: 1,
                biggest: 1,
                addedAt: "",
              },
            ],
          }),
        ],
      ]),
    );
    store.setState({ initDir: WS, layout: "workspace" });
    store.getState().setIsDictionariesOpen(true);
    const { unmount } = render(<DictionariesModal />);
    const row = await screen.findByTestId("dictionary-mdict:gone");
    expect(within(row).getByText("Not here")).toBeInTheDocument();
    expect(within(row).queryByLabelText("Sync Elsewhere")).toBeNull();
    unmount();
    fetchMock.mockImplementation(async () => respond({}, 404));
    render(
      <DictionaryLookup
        selection={selection("cold")}
        ws={WS}
        onKeep={vi.fn()}
      />,
    );
    await settle();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Wiktionary",
      "Wikipedia",
    ]);
  });
});

describe("sounds that cannot be played", () => {
  test("a format the web view does not play: said so", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      Object.assign(new Error("no supported source"), {
        name: "NotSupportedError",
      }),
    );
    render(<Pronunciations list={[{ audio: "https://x/cold.spx" }]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sound cannot be played: its format is not supported, or it was not found",
    );
    // played again: the message gone until it fails again
    vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });

  test("in an entry: a sound not in the dictionary file, said so", async () => {
    mockFs();
    const { html } = prepareEntry(
      '<a href="sound://cold0001.spx"><img src="Sound.png"></a> cold',
      "mw",
    );
    render(
      <MdictEntry
        ws="/ws"
        dict={{
          id: "mw",
          name: "MW",
          kind: "mdict",
          files: { mdx: "mw.mdx" },
          size: 1,
          biggest: 1,
          addedAt: "",
        }}
        html={html}
        onNavigate={vi.fn()}
      />,
    );
    const sound = screen
      .getByTestId("mdict-entry")
      .shadowRoot!.querySelector<HTMLElement>("[data-mdict-sound]")!;
    act(() => sound.click());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This sound is not in its dictionary file",
    );
  });
});
