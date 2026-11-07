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
import DictionaryLookup from "./DictionaryLookup";
import DictionariesModal from "./DictionariesModal";
import {
  DEFAULT_DICTIONARY_SETTINGS,
  orderedSources,
  withDictionaryDefaults,
  type DictionarySettings,
} from "./dictionary";

vi.mock("@/workspace/open", () => ({ openUrl: vi.fn(async () => undefined) }));

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

const FREE_COLD = [
  {
    word: "cold",
    phonetics: [{ text: "/koʊld/", audio: "https://x/cold-us.mp3" }],
    meanings: [
      { partOfSpeech: "adjective", definitions: [{ definition: "Chilly." }] },
    ],
  },
];

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
  test("a tab per dictionary on; the first that has the word shows; its recording plays", async () => {
    // not in Wiktionary: on to Free Dictionary
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("dictionaryapi.dev") ? respond(FREE_COLD) : respond({}, 404),
    );
    const onKeep = vi.fn();
    render(<DictionaryLookup selection={selection("cold")} onKeep={onKeep} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Wiktionary", "Free Dictionary"]);
    expect(await screen.findByText("Chilly.")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Free Dictionary" }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Play the pronunciation (US)" }),
    );
    expect(plays).toEqual(["https://x/cold-us.mp3"]);
    fireEvent.click(screen.getByText("Keep as note"));
    expect(onKeep).toHaveBeenCalledWith("*adjective* Chilly.");
    // back to Wiktionary: looked up once, not again
    fireEvent.click(screen.getByRole("tab", { name: "Wiktionary" }));
    expect(screen.getByText("No definition of “cold”")).toBeInTheDocument();
    await settle();
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes("definition")),
    ).toHaveLength(1);
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
      fetchMock.mock.calls.some(([u]) => String(u).includes("dictionaryapi")),
    ).toBe(false);
  });

  test("the order of the user; a link opens the site; none on", async () => {
    setSettings({
      order: ["google", "wiktionary"],
      enabled: { google: true, "free-dictionary": false },
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

    setSettings({ enabled: { wiktionary: false, "free-dictionary": false } });
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
      expect(
        screen.getByRole("tab", { name: "Free Dictionary" }),
      ).toHaveAttribute("aria-selected", "true"),
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
    expect(order().slice(0, 3)).toEqual([
      "wiktionary",
      "urban",
      "free-dictionary",
    ]);
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
