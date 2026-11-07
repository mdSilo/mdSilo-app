import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { joinPath } from "@/workspace/util";
import { DATA_DIR } from "@/workspace/layout";
import { updateDictionariesGitignore } from "@/workspace/gitignore";
import { confirmBigSync, fileSize } from "@/workspace/syncSize";

/**
 * The dictionary files imported by the user (MDict: .mdx, with its .mdd of
 * pictures and sounds, and .css), in the workspace:
 *
 *   .mdsilo/dictionaries.json            the list: name, files, size, synced
 *   .mdsilo/dictionaries/<id>/           the files of a dictionary
 *   .mdsilo/dictionaries/.gitignore      their files are not synced (git),
 *                                        unless chosen: they can be big
 *
 * The list is synced, so another device knows a dictionary not synced, and
 * says it is not there.
 */
export const DICTIONARY_LIST_FILE = "dictionaries.json";
export const DICTIONARY_DIR = "dictionaries";
const LIST_VERSION = 1;

export type LocalDictionary = {
  /** also the name of its folder */
  id: string;
  name: string;
  kind: "mdict";
  /** the names of the files in its folder */
  files: { mdx: string; mdd?: string[]; css?: string[] };
  /** bytes, of all its files and of the biggest */
  size: number;
  biggest: number;
  addedAt: string;
  /** the files synced with the workspace (git) */
  synced?: boolean;
};

export const DICTIONARY_FILE_TYPES = ["mdx", "mdd", "css"];

const listPath = (ws: string) => joinPath(ws, DATA_DIR, DICTIONARY_LIST_FILE);
export const dictionaryDir = (ws: string, id: string) =>
  joinPath(ws, DATA_DIR, DICTIONARY_DIR, id);
export const dictionaryFile = (ws: string, id: string, name: string) =>
  joinPath(dictionaryDir(ws, id), name);

export async function readDictionaryList(
  ws: string,
): Promise<LocalDictionary[]> {
  try {
    const text = await invoke<string>("read_file", { filePath: listPath(ws) });
    if (!text?.trim()) return [];
    const data = JSON.parse(text) as { dictionaries?: LocalDictionary[] };
    return (data.dictionaries ?? []).filter(
      (d) => typeof d?.id === "string" && d.files?.mdx,
    );
  } catch (e) {
    if (e instanceof SyntaxError)
      console.error(`${listPath(ws)} is not valid JSON`, e);
    return [];
  }
}

async function writeDictionaryList(ws: string, list: LocalDictionary[]) {
  const text = `${JSON.stringify({ version: LIST_VERSION, dictionaries: list }, null, 2)}\n`;
  const ok = await invoke<boolean>("write_file", {
    filePath: listPath(ws),
    text,
  });
  if (ok === false) throw new Error(`Failed to write ${DICTIONARY_LIST_FILE}`);
  await writeIgnore(ws, list);
}

/** .mdsilo/dictionaries/.gitignore: the files not synced, but those chosen. */
async function writeIgnore(ws: string, list: LocalDictionary[]) {
  const ignore = joinPath(ws, DATA_DIR, DICTIONARY_DIR, ".gitignore");
  const old = await invoke<string>("read_file", { filePath: ignore }).catch(
    () => "",
  );
  const next = updateDictionariesGitignore(
    old ?? "",
    list.filter((d) => d.synced).map((d) => d.id),
  );
  if (next !== old)
    await invoke("write_file", { filePath: ignore, text: next });
}

/** A file picked to import: a path (desktop) or the file itself (web). */
export type PickedFile = { name: string; path?: string; file?: File };

/** The files of a dictionary picked: an .mdx, the .mdd and .css of the same name. */
export type FileGroup = {
  stem: string;
  mdx: PickedFile;
  mdd: PickedFile[];
  css: PickedFile[];
};

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
/** `Oxford.mdx` → `oxford`; `Oxford.1.mdd` → `oxford`: the parts of a big .mdd too. */
const stemOf = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/\.\d+$/, "")
    .toLowerCase();

/**
 * The dictionaries in the files picked, each an .mdx with the .mdd (in parts
 * too: `name.1.mdd`) and .css of its name; the files left over, with no .mdx.
 */
export function groupDictionaryFiles(files: PickedFile[]): {
  groups: FileGroup[];
  left: PickedFile[];
} {
  const groups = files
    .filter((f) => extOf(f.name) === "mdx")
    .map((mdx) => ({
      stem: stemOf(mdx.name),
      mdx,
      mdd: [] as PickedFile[],
      css: [] as PickedFile[],
    }));
  const left: PickedFile[] = [];
  for (const f of files) {
    const ext = extOf(f.name);
    if (ext === "mdx") continue;
    const group = groups.find((g) => g.stem === stemOf(f.name));
    if (group && ext === "mdd") group.mdd.push(f);
    else if (group && ext === "css") group.css.push(f);
    else left.push(f);
  }
  for (const g of groups)
    g.mdd.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  return { groups, left };
}

/** A file name that can be in a folder: no folders, nothing hidden. */
const plainName = (name: string) =>
  (name.split(/[/\\]/).pop() ?? "").replace(/^\.+/, "").trim() || "file";

async function copyIn(picked: PickedFile, to: string): Promise<number> {
  if (picked.file) {
    const ok = await invoke<boolean>("write_file_blob", {
      filePath: to,
      blob: picked.file,
    });
    if (!ok) throw new Error(`Failed to copy ${picked.name}`);
    return picked.file.size;
  }
  if (!picked.path) throw new Error(`No file for ${picked.name}`);
  const ok = await invoke<boolean>("copy_file", {
    srcPath: picked.path,
    toPath: to,
  });
  if (!ok) throw new Error(`Failed to copy ${picked.name}`);
  return fileSize(to);
}

// the changes one at a time: each reads the list, then writes it
let queue: Promise<unknown> = Promise.resolve();

type Store = {
  /** the workspace of the list loaded */
  ws?: string;
  list: LocalDictionary[];
  /** the files of a dictionary are on this device */
  here: Record<string, boolean>;
  load: (ws: string) => Promise<void>;
};

async function presence(ws: string, list: LocalDictionary[]) {
  const here: Record<string, boolean> = {};
  await Promise.all(
    list.map(async (d) => {
      here[d.id] = Boolean(
        await invoke<boolean>("file_exist", {
          filePath: dictionaryFile(ws, d.id, d.files.mdx),
        }).catch(() => false),
      );
    }),
  );
  return here;
}

export const useLocalDictionaries = create<Store>((set) => ({
  list: [],
  here: {},
  load: async (ws) => {
    await queue;
    const list = await readDictionaryList(ws);
    set({ ws, list, here: await presence(ws, list) });
  },
}));

/** Change the list as it is now, then show it. */
function change<T>(
  ws: string,
  fn: (
    list: LocalDictionary[],
  ) => Promise<{ list?: LocalDictionary[]; value: T }>,
): Promise<T> {
  const run = async () => {
    const before = await readDictionaryList(ws);
    const { list, value } = await fn(before);
    if (list) await writeDictionaryList(ws, list);
    const now = list ?? before;
    useLocalDictionaries.setState({
      ws,
      list: now,
      here: await presence(ws, now),
    });
    return value;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

/** Hooks for the files of a dictionary: read (to check it), and dropped when removed. */
type Hooks = {
  /** the title of a dictionary file, or throws if the app cannot read it */
  check?: (ws: string, dict: LocalDictionary) => Promise<string | undefined>;
  forget?: (id: string) => void;
};
const hooks: Hooks = {};
export const setDictionaryHooks = (h: Hooks) => Object.assign(hooks, h);

export type ImportResult = {
  added: LocalDictionary[];
  /** the files not imported, and why */
  failed: Array<{ name: string; error: string }>;
};

/**
 * Import the dictionaries in the files picked into the workspace, not
 * synced: each checked (read) first, removed again if it cannot be read.
 */
export async function importDictionaries(
  ws: string,
  files: PickedFile[],
): Promise<ImportResult> {
  const { groups, left } = groupDictionaryFiles(files);
  const failed = left.map((f) => ({
    name: f.name,
    error: "No .mdx of the same name",
  }));
  const added: LocalDictionary[] = [];
  // not synced from the first file copied in
  if (groups.length) await writeIgnore(ws, await readDictionaryList(ws));
  for (const group of groups) {
    const id = crypto.randomUUID();
    const dir = dictionaryDir(ws, id);
    try {
      await invoke("create_dir_recursive", { dirPath: dir });
      const sizes: number[] = [];
      const copy = async (f: PickedFile) => {
        const name = plainName(f.name);
        sizes.push(await copyIn(f, joinPath(dir, name)));
        return name;
      };
      const mdx = await copy(group.mdx);
      const mdd: string[] = [];
      for (const f of group.mdd) mdd.push(await copy(f));
      const css: string[] = [];
      for (const f of group.css) css.push(await copy(f));
      const dict: LocalDictionary = {
        id,
        name: group.mdx.name.replace(/\.mdx$/i, ""),
        kind: "mdict",
        files: {
          mdx,
          ...(mdd.length ? { mdd } : {}),
          ...(css.length ? { css } : {}),
        },
        size: sizes.reduce((a, b) => a + b, 0),
        biggest: Math.max(0, ...sizes),
        addedAt: new Date().toISOString(),
      };
      const title = await hooks.check?.(ws, dict);
      if (title) dict.name = title;
      added.push(dict);
    } catch (e) {
      await invoke("delete_files", { paths: [dir] }).catch(() => undefined);
      hooks.forget?.(id);
      failed.push({
        name: group.mdx.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (added.length)
    await change(ws, async (list) => ({
      list: [...list, ...added],
      value: undefined,
    }));
  return { added, failed };
}

/** Remove a dictionary: its files (here; elsewhere once synced) and its entry. */
export function removeDictionary(ws: string, id: string) {
  return change(ws, async (list) => {
    hooks.forget?.(id);
    await invoke("delete_files", { paths: [dictionaryDir(ws, id)] }).catch(
      () => undefined,
    );
    return { list: list.filter((d) => d.id !== id), value: undefined };
  });
}

/** Rename a dictionary, as shown in the tabs. */
export const renameDictionary = (ws: string, id: string, name: string) =>
  change(ws, async (list) => ({
    list: list.map((d) =>
      d.id === id && name.trim() ? { ...d, name: name.trim() } : d,
    ),
    value: undefined,
  }));

/**
 * Sync the files of a dictionary with the workspace (git), or not; a big
 * one asked first. False if the user said no.
 */
export async function setDictionarySynced(
  ws: string,
  dict: LocalDictionary,
  synced: boolean,
): Promise<boolean> {
  if (
    synced &&
    !dict.synced &&
    !(await confirmBigSync([{ name: dict.name, size: dict.biggest }]))
  )
    return false;
  await change(ws, async (list) => ({
    list: list.map((d) => (d.id === dict.id ? { ...d, synced } : d)),
    value: undefined,
  }));
  return true;
}

/** Reset; for tests. */
export const resetLocalDictionaries = () => {
  queue = Promise.resolve();
  useLocalDictionaries.setState({ ws: undefined, list: [], here: {} });
};
