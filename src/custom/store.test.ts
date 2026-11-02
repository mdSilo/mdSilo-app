import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import {
  defineKind,
  drop,
  keep,
  merged,
  moveTo,
  plainFileName,
  readWorkspaceList,
  reloadPulled,
  type Kept,
  type Kind,
  type Where,
} from "./store";

type Item = Kept & { name: string };

/** a kind kept in memory, with the calls made to it */
function memoryKind(paths: string[] = []) {
  const places: Record<Where, Item[]> = { device: [], workspace: [] };
  const calls: string[] = [];
  const kind: Kind<Item> = {
    paths,
    list: (where) => places[where],
    save: async (where, items) => {
      places[where] = items;
    },
    copy: async (item, to) => {
      calls.push(`copy ${item.id} to ${to}`);
      return { ...item, where: to };
    },
    remove: async (item, from) => {
      calls.push(`remove ${item.id} from ${from}`);
    },
    load: async () => {
      calls.push("load");
    },
  };
  return { kind, places, calls };
}

const item = (id: string, where: Where = "device"): Item => ({
  id,
  where,
  name: id,
});

beforeEach(() => {
  store.setState({ initDir: "/ws", layout: "workspace" });
});

it("merges both places, the winner first", () => {
  const device = [item("a"), item("b")];
  const workspace = [item("b", "workspace"), item("c", "workspace")];
  expect(merged(device, workspace, "workspace").map((i) => i.where)).toEqual([
    "workspace",
    "workspace",
    "device",
  ]);
  expect(
    merged(device, workspace, "device").map((i) => `${i.id}${i.where}`),
  ).toEqual(["adevice", "bdevice", "cworkspace"]);
});

it("keeps an item where it says, out of the other place", async () => {
  const { kind, places, calls } = memoryKind();
  await keep(kind, item("a"));
  await keep(kind, { ...item("a"), name: "renamed" });
  expect(places.device).toEqual([{ ...item("a"), name: "renamed" }]);
  await keep(kind, item("a", "workspace"));
  expect(places.device).toEqual([]);
  expect(places.workspace).toEqual([item("a", "workspace")]);
  expect(calls).toEqual(["remove a from device"]);
});

it("moves an item: copied, kept there, removed from where it was", async () => {
  const { kind, places, calls } = memoryKind();
  places.device = [item("a"), item("b")];
  const moved = await moveTo(kind, item("a"), "workspace");
  expect(moved.where).toBe("workspace");
  expect(places.device).toEqual([item("b")]);
  expect(places.workspace).toEqual([moved]);
  expect(calls).toEqual(["copy a to workspace", "remove a from device"]);
  // already there: nothing to do
  await moveTo(kind, moved, "workspace");
  expect(calls).toHaveLength(2);
});

it("does not move to the workspace without one", async () => {
  const { kind, places, calls } = memoryKind();
  places.device = [item("a")];
  store.setState({ initDir: "" });
  await expect(moveTo(kind, item("a"), "workspace")).rejects.toThrow(
    "No workspace",
  );
  expect(places.device).toEqual([item("a")]);
  expect(calls).toEqual([]);
});

it("drops an item from both places", async () => {
  const { kind, places, calls } = memoryKind();
  places.device = [item("a")];
  places.workspace = [item("a", "workspace"), item("b", "workspace")];
  await drop(kind, "a");
  expect(places).toEqual({ device: [], workspace: [item("b", "workspace")] });
  expect(calls).toEqual(["remove a from device", "remove a from workspace"]);
});

it("reads a list of the workspace, leaving out what is not an item", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(
    JSON.stringify([{ id: "a", name: "A" }, { name: "no id" }, null]),
  );
  expect(await readWorkspaceList("things.json")).toEqual([
    { id: "a", name: "A", where: "workspace" },
  ]);
  expect(invoke).toHaveBeenCalledWith("read_file", {
    filePath: "/ws/.mdsilo/things.json",
  });
  vi.mocked(invoke).mockResolvedValueOnce("{");
  expect(await readWorkspaceList("things.json")).toEqual([]);
  vi.mocked(invoke).mockResolvedValueOnce("");
  expect(await readWorkspaceList("things.json")).toEqual([]);
  expect(await readWorkspaceList("things.json", undefined)).toEqual([]);
});

it("makes plain file names of names from a synced list", () => {
  expect(plainFileName("Noto.ttf")).toBe("Noto.ttf");
  expect(plainFileName("../../notes/a.md")).toBe("a.md");
  expect(plainFileName("C:\\x\\b.ttf")).toBe("b.ttf");
  expect(plainFileName("..")).toBe("");
  expect(plainFileName(".hidden")).toBe("hidden");
  expect(plainFileName('a<b>:"c".ttf')).toBe("abc.ttf");
});

it("reloads the kinds whose files a sync changed", async () => {
  const fonts = memoryKind(["fonts.json", "fonts"]);
  const themes = memoryKind(["themes.json"]);
  defineKind(fonts.kind);
  defineKind(themes.kind);
  await reloadPulled([".mdsilo/fonts/a.ttf", "writing/a.md"]);
  expect(fonts.calls).toEqual(["load"]);
  expect(themes.calls).toEqual([]);
  await reloadPulled([".mdsilo/themes.json", ".mdsilo/fontsx"]);
  expect(fonts.calls).toEqual(["load"]);
  expect(themes.calls).toEqual(["load"]);
});
