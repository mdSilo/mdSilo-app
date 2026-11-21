import { screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { defaultNote } from "@/types/model";
import { renderWithView, resetStore } from "@/testUtils";
import { useAiProviders, type AiProvider } from "./providers";
import {
  decodeIndex,
  encodeIndex,
  forgetLoadedIndex,
  fuseRanks,
  loadIndex,
  nearest,
  quantize,
  semanticSearch,
  similarNotes,
  updateIndex,
} from "./embeddings";
import SuggestedLinks from "./SuggestedLinks";
import { toolScopeOf } from "./chat/context";
import { runTool } from "./chat/tools";

const provider: AiProvider = {
  id: "e",
  kind: "openai",
  label: "E",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m", embedModel: "embed-1" },
};

/** a model of meaning: foxes (and the word vulpine) one way, dogs another */
const vectorOf = (text: string) => {
  const t = text.toLowerCase();
  return /fox|vulpine/.test(t)
    ? [1, 0.1, 0]
    : /dog|hound/.test(t)
      ? [0, 1, 0.1]
      : [0.1, 0, 1];
};

const note = (
  id: string,
  title: string,
  content: string,
  updated = "2026-11-01T00:00:00.000Z",
) =>
  store.getState().upsertNote({
    ...defaultNote,
    id,
    title,
    file_path: id,
    content,
    updated_at: updated,
  });

let files: Record<string, Uint8Array>;
let embedded: string[];

beforeEach(() => {
  resetStore();
  forgetLoadedIndex();
  store.getState().setInitDir("/ws");
  store.getState().setLayout("workspace");
  store.getState().setAiSettings({ ...DEFAULT_AI_SETTINGS, embeddings: true });
  useAiProviders.setState({ providers: [], searchServices: [], loaded: false });
  files = {};
  embedded = [];
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    const a = args as Record<string, unknown>;
    switch (cmd) {
      case "ai_providers":
        return [provider];
      case "ai_fetch": {
        const input = (a.body as { input: string[] }).input;
        embedded.push(...input);
        return {
          data: input.map((text, index) => ({
            index,
            embedding: vectorOf(text),
          })),
          usage: { prompt_tokens: input.length * 10 },
        };
      }
      case "read_file_bytes": {
        const data = files[String(a.filePath)];
        if (!data) throw new Error("no file");
        return data;
      }
      case "write_file_bytes":
        files[String(a.filePath)] = new Uint8Array(a.data as Uint8Array);
        return true;
      case "index_search":
        return [];
      default:
        return undefined;
    }
  });
  note("/ws/a.md", "Foxes", "A red fox ran across the field.\n\nshort");
  note("/ws/b.md", "Wild", "The fox hid in the forest at night.");
  note("/ws/c.md", "Dogs", "My dog barks at the mailman every day.");
  note("/ws/s.md", "Secret", "---\nai: false\n---\nA secret fox of mine.");
  note("/ws/chats/x.md", "Chat", "The AI said fox things here.");
});

describe("the index", () => {
  test("vectors as bytes, written and read back", () => {
    expect([...quantize([0.5, -1, 0.25])]).toEqual([64, -127, 32]);
    expect([...quantize([0, 0])]).toEqual([0, 0]);
    const index = {
      model: "m",
      dims: 3,
      notes: new Map([
        [
          "a.md",
          {
            updated: "u",
            paras: [0, 2],
            vectors: new Int8Array([127, 0, 0, 0, 127, 0]),
            norms: new Float32Array([127, 127]),
          },
        ],
      ]),
    };
    const back = decodeIndex(encodeIndex(index))!;
    expect(back.model).toBe("m");
    expect(back.notes.get("a.md")).toMatchObject({
      updated: "u",
      paras: [0, 2],
    });
    expect([...back.notes.get("a.md")!.vectors]).toEqual([
      127, 0, 0, 0, 127, 0,
    ]);
    expect(decodeIndex(new Uint8Array([1, 2]))).toBeNull();
    expect(nearest(back, new Int8Array([0, 100, 0]), 1)).toEqual([
      { path: "a.md", para: 2, score: 1 },
    ]);
  });

  test("made of the user's own notes; only what changed made again; gone notes taken out", async () => {
    const first = await updateIndex();
    expect(first).toEqual({ embedded: 3, removed: 0 });
    // the title before each paragraph; short ones, secret notes and chats left out
    expect(embedded.sort()).toEqual([
      "Dogs\nMy dog barks at the mailman every day.",
      "Foxes\nA red fox ran across the field.",
      "Wild\nThe fox hid in the forest at night.",
    ]);
    expect(Object.keys(files)[0]).toMatch(
      /\.mdsilo[\\/]local[\\/]ai-embeddings\.bin$/,
    );
    expect(store.getState().aiSettings.usage).not.toEqual({});

    embedded = [];
    expect(await updateIndex()).toEqual({ embedded: 0, removed: 0 });
    note(
      "/ws/b.md",
      "Wild",
      "The hound hid in the forest.",
      "2026-11-02T00:00:00.000Z",
    );
    store.getState().deleteNote("/ws/c.md");
    expect(await updateIndex()).toEqual({ embedded: 1, removed: 1 });
    expect(embedded).toEqual(["Wild\nThe hound hid in the forest."]);
    forgetLoadedIndex();
    expect([...(await loadIndex())!.notes.keys()].sort()).toEqual([
      "a.md",
      "b.md",
    ]);
  });

  test("a new model: a new index", async () => {
    await updateIndex();
    provider.settings.embedModel = "embed-2";
    embedded = [];
    expect((await updateIndex()).embedded).toBe(3);
    expect((await loadIndex())!.model).toBe("embed-2");
    provider.settings.embedModel = "embed-1";
  });
});

describe("searching by meaning", () => {
  test("found by meaning; a folder only; excluded folders never", async () => {
    note("/ws/private/p.md", "P", "The fox of my private folder.");
    await updateIndex();
    const found = await semanticSearch("vulpine", { limit: 3 });
    expect(found.map((f) => f.chunk.text).sort()).toEqual([
      "A red fox ran across the field.",
      "The fox hid in the forest at night.",
      "The fox of my private folder.",
    ]);
    // a folder only
    expect(
      (await semanticSearch("vulpine", { dir: "/ws/private" })).map(
        (f) => f.chunk.text,
      ),
    ).toEqual(["The fox of my private folder."]);
    // excluded after the index was made: still never read
    store
      .getState()
      .setAiSettings({ ...store.getState().aiSettings, excluded: ["private"] });
    expect(
      (await semanticSearch("vulpine")).map((f) => f.chunk.text),
    ).not.toContain("The fox of my private folder.");
    // off: nothing
    store
      .getState()
      .setAiSettings({ ...store.getState().aiSettings, embeddings: false });
    expect(await semanticSearch("vulpine")).toEqual([]);
  });

  test("hybrid: what the words miss, meaning finds; merged by rank", async () => {
    await updateIndex();
    const r = await runTool(
      { id: "1", name: "search", input: { query: "vulpine" } },
      toolScopeOf("all")!,
      1,
    );
    expect(r.chunks.map((c) => c.text)).toContain(
      "A red fox ran across the field.",
    );
    const a = { text: "a", href: "A" };
    const b = { text: "b", href: "B" };
    const c = { text: "c", href: "C" };
    expect(
      fuseRanks([
        [a, b],
        [b, c],
      ]),
    ).toEqual([b, a, c]);
  });
});

describe("links suggested", () => {
  test("notes on the same ideas, not linked yet", async () => {
    await updateIndex();
    expect((await similarNotes("/ws/a.md")).map((s) => s.title)).toEqual([
      "Wild",
    ]);
    expect(
      await similarNotes("/ws/a.md", { skip: new Set(["/ws/b.md"]) }),
    ).toEqual([]);
  });

  test("under the note, if on; none linked already", async () => {
    await updateIndex();
    store
      .getState()
      .setAiSettings({ ...store.getState().aiSettings, linkSuggestions: true });
    renderWithView(<SuggestedLinks noteId="/ws/a.md" />);
    expect(await screen.findByText("Wild")).toBeInTheDocument();
    expect(
      screen.getByText("The fox hid in the forest at night."),
    ).toBeInTheDocument();
  });

  test("a note linking the other: not suggested", async () => {
    note("/ws/a.md", "Foxes", "A red fox ran across the field. See [[Wild]].");
    await updateIndex();
    store
      .getState()
      .setAiSettings({ ...store.getState().aiSettings, linkSuggestions: true });
    const { container } = renderWithView(<SuggestedLinks noteId="/ws/a.md" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe("");
  });
});
