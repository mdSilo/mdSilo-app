import { act, renderHook, waitFor } from "@testing-library/react";
import { store } from "@/state/store";
import { useWebFs } from "../../testUtils";
import { usePopups } from "../popups";
import { resetReaderStore, useReaderStore } from "../readerStore";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "../settings";
import { bookStyles, themeColors } from "../styles";
import type { FoliateView } from "../view";
import { resetVocabulary, useVocabulary } from "../vocabulary/vocabulary";
import { LENS_CLASS } from "./lens";
import { resetWordLens, useWordLens } from "./useWordLens";

const WS = "/mdSilo";

/** A view of a page, and of one loaded after it. */
function viewOf(html: string, fixed = false) {
  document.body.innerHTML = html;
  const contents = [{ doc: document, index: 1 }];
  const view = Object.assign(new EventTarget(), {
    isFixedLayout: fixed,
    renderer: {
      getContents: () => contents,
      shadowRoot: null,
    },
    getCFI: (index: number) => `epubcfi(/6/${index * 2}!/4)`,
    getBoundingClientRect: () => new DOMRect(0, 0, 800, 600),
  }) as unknown as FoliateView;
  const load = (doc: Document, index: number) => {
    contents.push({ doc, index });
    view.dispatchEvent(new CustomEvent("load", { detail: { doc, index } }));
  };
  return { view, load };
}

const glosses = (doc: Document = document) =>
  [...doc.querySelectorAll<HTMLElement>(`.${LENS_CLASS}`)].map(
    (el) => `${el.nextSibling?.textContent?.split(" ")[0]}:${el.dataset.gloss}`,
  );

const settings = (patch: Partial<ReaderSettings>) =>
  store.setState({
    readerSettings: { ...DEFAULT_READER_SETTINGS, ...patch },
  });

beforeEach(async () => {
  await useWebFs();
  resetVocabulary();
  resetWordLens();
  useReaderStore.setState({ ws: WS });
  const { add } = useVocabulary.getState();
  await add(WS, {
    word: "rabbit",
    definition: "<p><i>Noun</i> A small mammal with long ears.</p>",
  });
  await add(WS, { word: "cold", definition: "<p><i>Adj</i> Chilly.</p>" });
});

afterEach(() => {
  resetReaderStore();
  vi.unstubAllGlobals();
});

describe("the word lens", () => {
  test("off: nothing; on: the words of the vocabulary glossed, in the pages loaded after too", async () => {
    const { view, load } = viewOf("<p>The rabbits were cold.</p>");
    settings({ wordLens: false });
    const { rerender } = renderHook(() => useWordLens(view, "main"));
    expect(glosses()).toEqual([]);

    await act(async () => settings({ wordLens: true }));
    rerender();
    await waitFor(() =>
      expect(glosses()).toEqual([
        "rabbits:A small mammal with long ears",
        "cold.:Chilly",
      ]),
    );
    // a section loaded
    const next = document.implementation.createHTMLDocument();
    next.body.innerHTML = "<p>A cold rabbit.</p>";
    act(() => load(next, 2));
    expect(glosses(next)).toEqual([
      "cold:Chilly",
      "rabbit.:A small mammal with long ears",
    ]);

    // a word added: glossed; a gloss written: shown
    await act(async () => {
      await useVocabulary.getState().add(WS, {
        word: "were",
        definition: "<p>was</p>",
      });
    });
    await waitFor(() => expect(glosses()).toHaveLength(3));
    const cold = useVocabulary
      .getState()
      .entries.find((e) => e.word === "cold")!;
    await act(async () => {
      await useVocabulary.getState().setGloss(WS, cold.id, "frosty");
    });
    await waitFor(() => expect(glosses(next)[0]).toBe("cold:frosty"));

    // off again: all taken away
    await act(async () => settings({ wordLens: false }));
    rerender();
    expect(glosses()).toEqual([]);
    expect(glosses(next)).toEqual([]);
  });

  test("a gloss clicked: its word in the dictionaries, no page turned", async () => {
    settings({ wordLens: true });
    const { view } = viewOf("<p>The rabbits ran.</p>");
    renderHook(() => useWordLens(view, "main"));
    await waitFor(() => expect(glosses()).toHaveLength(1));
    const turned = vi.fn();
    document.addEventListener("click", turned);
    const marker = document.querySelector<HTMLElement>(`.${LENS_CLASS}`)!;
    act(() => marker.click());
    expect(turned).not.toHaveBeenCalled();
    const lookup = usePopups.getState().lookup;
    expect(lookup?.kind).toBe("dictionary");
    expect(lookup?.selection).toMatchObject({
      text: "rabbit",
      index: 1,
      cfi: "epubcfi(/6/2!/4)",
    });
    expect(lookup?.selection.range?.toString()).toBe("rabbits");
    document.removeEventListener("click", turned);
  });

  test("glosses translated: the words met translated once, kept", async () => {
    settings({ wordLens: true, lensGloss: "translation", translateTo: "fr" });
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const q = new URL(url).searchParams.get("q") ?? "";
        asked.push(q);
        return {
          ok: true,
          status: 200,
          json: async () => [[[q === "rabbit" ? "lapin" : q, q]], null, "en"],
        };
      }),
    );
    const { view } = viewOf("<p>A rabbit, a rabbit.</p>");
    renderHook(() => useWordLens(view, "main"));
    // the definition until it is translated
    await waitFor(() =>
      expect(glosses()).toEqual(["rabbit,:lapin", "rabbit.:lapin"]),
    );
    expect(asked).toEqual(["rabbit"]);
    expect(
      useVocabulary.getState().entries.find((e) => e.word === "rabbit")
        ?.translations,
    ).toEqual({ fr: "lapin" });
  });

  test("translated to the language of the book itself: the definitions", async () => {
    settings({
      wordLens: true,
      lensGloss: "translation",
      translateTo: "en-GB",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { view } = viewOf("<p>A rabbit.</p>");
    Object.assign(view, { language: { canonical: "en" } });
    renderHook(() => useWordLens(view, "main"));
    await waitFor(() =>
      expect(glosses()).toEqual(["rabbit.:A small mammal with long ears"]),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a fixed layout: none", async () => {
    settings({ wordLens: true });
    const { view } = viewOf("<p>A rabbit.</p>", true);
    renderHook(() => useWordLens(view, "main"));
    await act(async () => {});
    expect(glosses()).toEqual([]);
  });

  test("room under the lines, of the line height and the gloss size; the glosses' look in the pages", () => {
    const css = (patch: Partial<ReaderSettings>, dark = false) =>
      bookStyles(
        { ...DEFAULT_READER_SETTINGS, ...patch },
        themeColors(dark, dark ? "dark" : "light"),
      );
    expect(css({ lineHeight: 1.5 })).toContain("line-height: 1.5;");
    expect(css({ lineHeight: 1.5 })).not.toContain("attr(data-gloss)");
    // 1.5 + 0.6 × 1.15 + 0.12
    const on = css({ lineHeight: 1.5, wordLens: true });
    expect(on).toContain("line-height: 2.31;");
    expect(on).toContain("content: attr(data-gloss)");
    expect(on).toContain("font-size: 0.6em");
    // the accent of the page by default
    expect(on).toContain("color: #2563eb;");
    // more room for bigger glosses, and for more line height
    expect(css({ lineHeight: 1.5, wordLens: true, lensSize: 0.8 })).toContain(
      "line-height: 2.54;",
    );
    expect(css({ lineHeight: 2, wordLens: true })).toContain(
      "line-height: 2.81;",
    );
    // a color of the user, lighter on a dark page
    expect(css({ wordLens: true, lensColor: "green" })).toContain(
      "color: #067647;",
    );
    expect(css({ wordLens: true, lensColor: "green" }, true)).toContain(
      "color: #75e0a7;",
    );
  });
});
