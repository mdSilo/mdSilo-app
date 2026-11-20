import { describe, expect, test, vi } from "vitest";
import { forwardRef, useImperativeHandle } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { NoteMap } from "@/lib/noteMap";
import { store } from "@/state/store";
import {
  ProvideCurrentView,
  useCurrentViewContext,
} from "@/state/useCurrentView";
import { followRename } from "@/workspace/renames";
import { makeFileMeta, makeNote, mockInvoke } from "@/testUtils";
import MdView from "./MdView";
import {
  QUOTE_MIME,
  closeBeside,
  focusedNoteId,
  followBesideRenames,
  openBeside,
  openNoteIds,
} from "./beside";
import { editorOf } from "./editors";

// one mock editor per note: its props, and the markdown put in it
type EditorProps = Record<string, (...args: never[]) => unknown> & {
  value: string;
  docPath: string;
};
const editors = vi.hoisted(() => ({
  props: new Map<string, EditorProps>(),
  inserted: [] as { value: string; markdown: string; at?: unknown }[],
}));

vi.mock("mdsmirror", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mdsmirror")>();
  const MockEditor = forwardRef(function MockEditor(
    props: Record<string, unknown>,
    ref,
  ) {
    editors.props.set(props.value as string, props as EditorProps);
    useImperativeHandle(ref, () => ({
      getHeadings: () => [],
      insertMarkdown: (markdown: string, at?: unknown) => {
        editors.inserted.push({ value: props.value as string, markdown, at });
        return true;
      },
    }));
    return <div data-testid="ms-editor">{props.value as string}</div>;
  });
  return { ...actual, default: MockEditor };
});
vi.mock("@/workspace/write", () => ({
  writeFile: vi.fn(async () => undefined),
  deleteFile: vi.fn(async () => undefined),
  writeJsonFile: vi.fn(async () => undefined),
}));

const main = makeNote({ id: "/ws/Main.md", title: "Main", content: "main" });
const side = makeNote({ id: "/ws/Side.md", title: "Side", content: "side" });
const third = makeNote({ id: "/ws/Third.md", title: "Third", content: "3rd" });
const bookNotes = makeNote({
  id: "/ws/reading/Alice.epub.md",
  title: "Alice.epub",
});
const all = [main, side, third, bookNotes];

function setup() {
  store
    .getState()
    .setNotes(NoteMap.from(Object.fromEntries(all.map((n) => [n.id, n]))));
  store.getState().setInitDir("/ws");
  store.getState().setIsLoaded(true);
  mockInvoke(invoke, {
    file_exist: true,
    get_parent_dir: ({ path }: Record<string, unknown>) =>
      (path as string).replace(/\/[^/]*$/, ""),
    get_file_meta: ({ filePath }: Record<string, unknown>) => {
      const note = all.find((n) => n.id === filePath);
      return makeFileMeta({
        file_path: filePath as string,
        file_name: (filePath as string).split("/").pop(),
        file_text: note?.content ?? "",
      });
    },
  });
}

/** The main note shown in the view, as the app does */
async function showMain(view: ReturnType<typeof useCurrentViewContext>) {
  store.getState().setCurrentNote({ [main.id]: main });
  act(() => view.dispatch({ view: "md", params: { noteId: main.id } }));
}

function App() {
  const view = useCurrentViewContext();
  return (
    <>
      <button onClick={() => void showMain(view)}>show main</button>
      <button
        onClick={() =>
          view.dispatch({ view: "md", params: { noteId: side.id } })
        }
      >
        show side
      </button>
      <p data-testid="view">{JSON.stringify(view.state)}</p>
      <MdView />
    </>
  );
}

async function renderApp() {
  setup();
  render(
    <ProvideCurrentView>
      <App />
    </ProvideCurrentView>,
  );
  await userEvent.click(screen.getByText("show main"));
}

describe("openBeside", () => {
  test("keeps the record of the note shown, and drops it once closed", async () => {
    setup();
    store.getState().setCurrentNoteId(main.id);
    store.getState().setCurrentNote({ [main.id]: main });
    expect(await openBeside(side.id)).toBe(true);
    expect(store.getState().besideNoteId).toBe(side.id);
    expect(Object.keys(store.getState().currentNote).sort()).toEqual([
      main.id,
      side.id,
    ]);
    // another note shown: the note beside kept
    store.getState().setCurrentNoteId(third.id);
    store.getState().setCurrentNote({ [third.id]: third });
    expect(store.getState().currentNote[side.id]).toBeDefined();
    expect(openNoteIds()).toEqual([third.id, side.id]);
    expect(focusedNoteId()).toBe(side.id);
    act(() => store.getState().setNotePane("main"));
    expect(focusedNoteId()).toBe(third.id);
    closeBeside();
    expect(store.getState().besideNoteId).toBe("");
    expect(store.getState().currentNote[side.id]).toBeUndefined();
    expect(store.getState().currentNote[third.id]).toBeDefined();
  });

  test("not the note shown, not the notes of a book", async () => {
    setup();
    store.getState().setCurrentNoteId(main.id);
    expect(await openBeside(main.id)).toBe(false);
    expect(await openBeside(bookNotes.id)).toBe(false);
    expect(store.getState().besideNoteId).toBe("");
  });

  test("follows its file renamed", async () => {
    setup();
    const stop = followBesideRenames();
    await openBeside(side.id);
    all.push(makeNote({ id: "/ws/Moved.md", title: "Moved" }));
    // the rename is followed in the app (links, issues), then the views
    await followRename(side.id, "/ws/Moved.md").catch(() => undefined);
    stop();
    all.pop();
    await vi.waitFor(() =>
      expect(store.getState().besideNoteId).toBe("/ws/Moved.md"),
    );
  });
});

describe("the note beside", () => {
  test("shows by the note, on the side asked, and closes", async () => {
    await renderApp();
    await act(async () => {
      await openBeside(side.id);
    });
    const pane = screen.getByTestId("beside-note");
    expect(within(pane).getByTestId("ms-editor")).toHaveTextContent("side");
    expect(screen.getAllByTestId("ms-editor")).toHaveLength(2);
    // the window title stays of the note shown: one ViewMenu only
    expect(pane.className).toContain("border-l");
    await userEvent.click(within(pane).getByLabelText("Swap sides"));
    expect(store.getState().besideOnLeft).toBe(true);
    expect(screen.getByTestId("beside-note").className).toContain("border-r");
    await userEvent.click(
      within(screen.getByTestId("beside-note")).getByLabelText(
        "Close the note beside",
      ),
    );
    expect(screen.queryByTestId("beside-note")).not.toBeInTheDocument();
    expect(store.getState().besideNoteId).toBe("");
  });

  test("its links open in it; the view stays", async () => {
    await renderApp();
    await act(async () => {
      await openBeside(side.id);
    });
    const props = editors.props.get("side")!;
    await act(async () => {
      await (props.onOpenLink as (href: string) => Promise<void>)("Third");
    });
    expect(store.getState().besideNoteId).toBe(third.id);
    expect(JSON.parse(screen.getByTestId("view").textContent!).params).toEqual({
      noteId: main.id,
    });
    expect(
      within(screen.getByTestId("beside-note")).getByTestId("ms-editor"),
    ).toHaveTextContent("3rd");
  });

  test("the note beside shown in the view: one editor of it, beside closed", async () => {
    await renderApp();
    await act(async () => {
      await openBeside(side.id);
    });
    store.getState().setCurrentNote({ [side.id]: side });
    await userEvent.click(screen.getByText("show side"));
    expect(store.getState().besideNoteId).toBe("");
    expect(screen.getAllByTestId("ms-editor")).toHaveLength(1);
  });

  test("the pane used last is the one the plugins act on", async () => {
    await renderApp();
    await act(async () => {
      await openBeside(side.id);
    });
    act(() => store.getState().setNotePane("main"));
    fireEvent.pointerDown(
      within(screen.getByTestId("beside-note")).getByTestId("ms-editor"),
    );
    expect(focusedNoteId()).toBe(side.id);
    expect(editorOf(side.id)).toBeDefined();
    fireEvent.pointerDown(screen.getAllByTestId("ms-editor")[0]);
    expect(focusedNoteId()).toBe(main.id);
  });

  test("a quote dropped on it is put where dropped", async () => {
    await renderApp();
    await act(async () => {
      await openBeside(side.id);
    });
    editors.inserted.length = 0;
    const target = document.getElementById("note-content-beside")!;
    const data = new Map([[QUOTE_MIME, "> to be\n>\n> — [Hamlet](book:x)"]]);
    const dataTransfer = {
      types: [...data.keys()],
      getData: (type: string) => data.get(type) ?? "",
      dropEffect: "none",
    };
    fireEvent.dragOver(target, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("copy");
    fireEvent.drop(target, { dataTransfer, clientX: 10, clientY: 20 });
    // (jsdom has no DragEvent: no point of the drop)
    expect(editors.inserted).toEqual([
      expect.objectContaining({
        value: "side",
        markdown: "> to be\n>\n> — [Hamlet](book:x)",
      }),
    ]);
  });

  test("the menu opens a note beside", async () => {
    await renderApp();
    await userEvent.click(screen.getByLabelText("Open beside"));
    const menu = await screen.findByTestId("beside-menu");
    // the notes written last, not the note shown, not the notes of a book
    expect(within(menu).queryByText("Main")).not.toBeInTheDocument();
    expect(within(menu).queryByText("Alice.epub")).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByText("Third"));
    await vi.waitFor(() =>
      expect(store.getState().besideNoteId).toBe(third.id),
    );
    expect(screen.queryByTestId("beside-menu")).not.toBeInTheDocument();
  });
});
