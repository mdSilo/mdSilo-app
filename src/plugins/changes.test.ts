import { renderHook } from "@testing-library/react";
import { store } from "@/state/store";
import { NoteMap } from "@/lib/noteMap";
import { makeNote } from "@/testUtils";
import { changedNotes, useWorkspaceChanged } from "./changes";
import type { PluginHost } from "./host";

const a = makeNote({ id: "/ws/a.md", title: "a", content: "one" });
const b = makeNote({ id: "/ws/b.md", title: "b", content: "two" });

describe("changedNotes", () => {
  it("finds the notes made, deleted and edited", () => {
    const before = NoteMap.from([a, b]);
    expect(changedNotes(before, before)).toEqual([]);
    const c = makeNote({ id: "/ws/c.md", title: "c" });
    const after = NoteMap.from([{ ...a, content: "uno" }, c]);
    expect(changedNotes(before, after).sort()).toEqual([
      "/ws/a.md",
      "/ws/b.md",
      "/ws/c.md",
    ]);
  });

  it("leaves out a note loaded, the same note copied, and other files", () => {
    const lazy = makeNote({
      id: "/ws/lazy.md",
      title: "lazy",
      parsed: { links: [], tags: [] } as never,
    });
    const png = makeNote({ id: "/ws/cat.png", title: "cat" });
    const before = NoteMap.from([a, lazy]);
    const after = NoteMap.from([
      { ...a },
      { ...lazy, content: "read now", parsed: undefined },
      png,
    ]);
    expect(changedNotes(before, after)).toEqual([]);
  });
});

describe("useWorkspaceChanged", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tells the view of the notes changed, once they pause", () => {
    store.getState().setInitDir("/ws");
    store.getState().upsertNotes([a, b]);
    const emit = vi.fn();
    const host = { current: { emit } as unknown as PluginHost };
    const { unmount } = renderHook(() => useWorkspaceChanged(host));
    store.getState().updateNote({ id: a.id, content: "1" });
    store.getState().updateNote({ id: a.id, content: "2" });
    store.getState().deleteNote(b.id);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe("notes.changed");
    expect(emit.mock.calls[0][1].paths.sort()).toEqual(["a.md", "b.md"]);
    unmount();
    store.getState().updateNote({ id: a.id, content: "3" });
    vi.advanceTimersByTime(600);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
