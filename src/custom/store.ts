import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "@/workspace/util";
import { DATA_DIR, dataRoot } from "@/workspace/layout";

/**
 * Where the customizations of the user are kept: on this device, or in the
 * workspace (in `.mdsilo/`, synced with it). Themes, fonts and plugins each
 * say how to keep their items in both places (a `Kind`); moving an item from
 * one to the other is the same for all of them.
 */
export type Where = "device" | "workspace";

export type Kept = { id: string; where: Where };

export type Kind<T extends Kept> = {
  /** the paths in `.mdsilo/` of the items: a sync that changes them reloads them */
  paths: string[];
  /** the items kept in a place */
  list(where: Where): T[];
  /** keep the list of items of a place; none for a kind whose files are the list */
  save?(where: Where, items: T[]): Promise<void>;
  /** copy the files of an item to the other place, gives the item there */
  copy?(item: T, to: Where): Promise<T>;
  /** remove the files of an item from a place */
  remove?(item: T, from: Where): Promise<void>;
  /** read the items of the workspace again */
  load(): Promise<void>;
};

export const otherPlace = (where: Where): Where =>
  where === "device" ? "workspace" : "device";

/** The data folder of the workspace, to keep items in; throws without one. */
export function workspaceData(): string {
  const data = dataRoot();
  if (!data) throw new Error("No workspace to keep it in");
  return data;
}

/** Items of both places: those of `wins` when an item is in both. */
export function merged<T extends Kept>(
  device: T[],
  workspace: T[],
  wins: Where,
): T[] {
  const [first, second] =
    wins === "workspace" ? [workspace, device] : [device, workspace];
  const ids = new Set(first.map((item) => item.id));
  return [...first, ...second.filter((item) => !ids.has(item.id))];
}

const without = <T extends Kept>(items: T[], id: string) =>
  items.filter((item) => item.id !== id);

/**
 * Add or update an item where it is to be kept, and take it out of the
 * other place if it was there.
 */
export async function keep<T extends Kept>(kind: Kind<T>, item: T) {
  const items = kind.list(item.where);
  const at = items.findIndex((i) => i.id === item.id);
  await kind.save?.(
    item.where,
    at < 0 ? [...items, item] : items.map((i, n) => (n === at ? item : i)),
  );
  const other = otherPlace(item.where);
  const there = kind.list(other).find((i) => i.id === item.id);
  if (there) {
    await kind.save?.(other, without(kind.list(other), item.id));
    await kind.remove?.(there, other);
  }
}

/** Move an item to a place: its files copied first, then taken out of where it was. */
export async function moveTo<T extends Kept>(
  kind: Kind<T>,
  item: T,
  to: Where,
): Promise<T> {
  if (item.where === to) return item;
  if (to === "workspace") workspaceData();
  const moved = kind.copy
    ? await kind.copy(item, to)
    : ({ ...item, where: to } as T);
  await keep(kind, moved);
  return moved;
}

/** Remove an item from both places. */
export async function drop<T extends Kept>(kind: Kind<T>, id: string) {
  for (const where of ["device", "workspace"] as const) {
    const item = kind.list(where).find((i) => i.id === id);
    if (!item) continue;
    await kind.save?.(where, without(kind.list(where), id));
    await kind.remove?.(item, where);
  }
}

/** A list of items in a JSON file of the workspace, `[]` if there is none. */
export async function readWorkspaceList<T extends Kept>(
  file: string,
  data = dataRoot(),
): Promise<T[]> {
  if (!data) return [];
  try {
    const text = await invoke<string>("read_file", {
      filePath: joinPath(data, file),
    });
    const items: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(items)
      ? items
          .filter((item): item is T => typeof item?.id === "string")
          .map((item) => ({ ...item, where: "workspace" }))
      : [];
  } catch {
    return [];
  }
}

export async function writeWorkspaceList<T extends Kept>(
  file: string,
  items: T[],
) {
  const text = `${JSON.stringify(
    items.map(({ where: _, ...item }) => item),
    null,
    2,
  )}\n`;
  const ok = await invoke<boolean>("write_file", {
    filePath: joinPath(workspaceData(), file),
    text,
  });
  if (ok === false) throw new Error(`Failed to write ${file}`);
}

/**
 * A plain file name, to put a file named by a synced list in a folder of
 * the workspace: no folders, nothing hidden.
 */
export const plainFileName = (name: string) =>
  [...(name.split(/[/\\]/).pop() ?? "")]
    .filter((c) => c >= " " && !'<>:"|?*'.includes(c))
    .join("")
    .replace(/^\.+/, "")
    .trim();

const kinds: Kind<Kept>[] = [];

/** Make a kind known, to reload it when a sync changes its files. */
export function defineKind<T extends Kept>(kind: Kind<T>): Kind<T> {
  kinds.push(kind as unknown as Kind<Kept>);
  return kind;
}

/** Reload the kinds whose files a sync changed; `pulled` are paths in the workspace. */
export async function reloadPulled(pulled: string[]) {
  const changed = kinds.filter((kind) =>
    kind.paths.some((path) => {
      const full = `${DATA_DIR}/${path}`;
      return pulled.some((p) => p === full || p.startsWith(`${full}/`));
    }),
  );
  for (const kind of changed) {
    try {
      await kind.load();
    } catch (e) {
      console.error("Error on reloading customizations:", e);
    }
  }
}
