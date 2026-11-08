import { act, fireEvent, render, screen } from "@testing-library/react";
import { store } from "@/state/store";
import { DEFAULT_DICTIONARY_SETTINGS } from "@/reader/dictionary/dictionary";
import EditorLookupPopup from "./LookupPopup";
import { useEditorLookup } from "./editorLookup";

const respond = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    statusText: String(status),
    json: async () => body,
  }) as Response;

beforeEach(() => {
  store.getState().setDictionarySettings(DEFAULT_DICTIONARY_SETTINGS);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("page/definition")
        ? respond({
            en: [
              {
                partOfSpeech: "Adjective",
                language: "English",
                definitions: [{ definition: "Having a low temperature." }],
              },
            ],
          })
        : respond({}),
    ),
  );
});

afterEach(() => {
  act(() => useEditorLookup.getState().clear());
  vi.unstubAllGlobals();
});

describe("a lookup in a note", () => {
  test("at the text and the toolbar over it: clear of both", () => {
    const rect = (top: number, bottom: number) =>
      ({
        left: 100,
        right: 160,
        top,
        bottom,
        width: 60,
        height: bottom - top,
      }) as DOMRect;
    const range = { getBoundingClientRect: () => rect(300, 320) } as Range;
    useEditorLookup.getState().show("cold", range, rect(250, 290));
    expect(useEditorLookup.getState().lookup?.box).toEqual({
      left: 100,
      right: 160,
      top: 250,
      bottom: 320,
    });
    // no toolbar shown: the text only
    useEditorLookup.getState().show("cold", range);
    expect(useEditorLookup.getState().lookup?.box.top).toBe(300);
  });

  test("the settings of the dictionaries opened: gone", async () => {
    render(<EditorLookupPopup />);
    act(() => useEditorLookup.getState().show("cold"));
    expect(
      await screen.findByTestId("editor-lookup-popup"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dictionary settings"));
    expect(store.getState().isDictionariesOpen).toBe(true);
    expect(screen.queryByTestId("editor-lookup-popup")).toBeNull();
    act(() => store.getState().setIsDictionariesOpen(false));
  });

  test("the dictionaries at the text; gone on Escape, a click elsewhere", async () => {
    render(<EditorLookupPopup />);
    expect(screen.queryByTestId("editor-lookup-popup")).toBeNull();
    act(() => useEditorLookup.getState().show(" cold "));
    expect(
      await screen.findByText("Having a low temperature."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Wiktionary",
      "Wikipedia",
    ]);
    // no highlight to keep it as the note of
    expect(screen.queryByText("Keep as note")).toBeNull();
    // a click in it: kept
    fireEvent.pointerDown(screen.getByRole("tab", { name: "Wikipedia" }));
    expect(screen.getByTestId("editor-lookup-popup")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("editor-lookup-popup")).toBeNull();

    act(() => useEditorLookup.getState().show("cold"));
    expect(
      await screen.findByTestId("editor-lookup-popup"),
    ).toBeInTheDocument();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByTestId("editor-lookup-popup")).toBeNull();
  });
});
