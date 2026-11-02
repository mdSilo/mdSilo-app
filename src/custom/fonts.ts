import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { store, useStore } from "@/state/store";
import { isTauri, joinPath } from "@/workspace/util";
import { dataRoot } from "@/workspace/layout";
import {
  defineKind,
  drop,
  merged,
  plainFileName,
  readWorkspaceList,
  workspaceData,
  writeWorkspaceList,
  type Where,
} from "./store";

/**
 * The fonts of the app, one list for the editor and the reader. A font is
 * chosen by an id:
 * - `''` the default of the view (`book` in the reader: as the book says)
 * - `serif`, `sans-serif`, `monospace`: generic stacks
 * - a bundled family name, e.g. `Sniglet`
 * - `system:<family>`: a font installed on the system, listed by the app
 *   (src-tauri/src/system_fonts.rs; not in the web version)
 * - `custom:<id>`: a font added by the user: a file imported, or a font
 *   installed on the system, by its name. Kept on this device (the file in
 *   IndexedDB) or in the workspace (`.mdsilo/fonts/<file>`, listed in
 *   `.mdsilo/fonts.json`, synced).
 */
export type CustomFont = {
  id: string;
  family: string;
  /** the name of the file imported, '' for a system font */
  fileName: string;
  where: Where;
};

export const FONT_LIST_FILE = "fonts.json";
export const FONT_DIR = "fonts";

export type FontOption = { id: string; name: string };

export const SERIF = `'Literata', 'Georgia', 'Noto Serif', 'Songti SC', 'Noto Serif CJK SC', serif`;
export const SANS = `'Inter', 'Helvetica Neue', 'Noto Sans', 'PingFang SC', 'Noto Sans CJK SC', sans-serif`;
export const MONO = `'RobotoMono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`;

export const GENERIC_FONTS: FontOption[] = [
  { id: "serif", name: "Serif" },
  { id: "sans-serif", name: "Sans serif" },
  { id: "monospace", name: "Monospace" },
];

/** fonts shipped with the app, see styles/index.css */
export const BUNDLED_FONTS: FontOption[] = [
  { id: "Sniglet", name: "Sniglet" },
  { id: "RobotoMono", name: "Roboto Mono" },
  { id: "IBMPlexSerif", name: "IBM Plex Serif" },
  { id: "KaTeX_SansSerif", name: "KaTeX Sans Serif" },
];

export const FONT_FILE_TYPES = ["ttf", "otf", "woff", "woff2"];

const quote = (family: string) => `'${family.replace(/['\\]/g, "")}'`;

/** The CSS `font-family` of a font id, '' for the default. */
export function fontFamilyOf(
  id: string,
  customFonts: CustomFont[] = [],
): string {
  if (!id || id === "book") return "";
  if (id === "serif") return SERIF;
  if (id === "sans-serif") return SANS;
  if (id === "monospace") return MONO;
  if (id.startsWith("system:")) return quote(id.slice("system:".length));
  if (id.startsWith("custom:")) {
    const font = customFonts.find((f) => `custom:${f.id}` === id);
    return font ? quote(font.family) : "";
  }
  return quote(id);
}

/** A family name from a font file name: `Noto_Serif-Regular.ttf` -> `Noto Serif` */
export const familyOfFile = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, "")
    .replace(/-(regular|normal|book)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

// the font files, in IndexedDB: per device, on desktop and web alike
const DB = "mdsilo-fonts";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const toBuffer = (data: ArrayBuffer | number[]) =>
  data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;

/** The file of a font of the workspace */
const workspaceFontPath = (font: CustomFont, data = workspaceData()) =>
  joinPath(data, FONT_DIR, plainFileName(font.fileName));

/** A file name in `.mdsilo/fonts/` not taken by another font */
function freeFileName(font: CustomFont, others: CustomFont[]): string {
  const name = plainFileName(font.fileName) || `${font.id}.ttf`;
  const taken = (n: string) =>
    others.some((f) => f.id !== font.id && plainFileName(f.fileName) === n);
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  return `${stem}-${font.id.slice(0, 8)}${ext}`;
}

const saveFontData = (id: string, data: ArrayBuffer) =>
  withStore("readwrite", (s) => s.put(data, id));
const readFontData = (id: string) =>
  withStore<ArrayBuffer | undefined>("readonly", (s) => s.get(id));
const deleteFontData = (id: string) =>
  withStore("readwrite", (s) => s.delete(id));

/** Fonts of the workspace win over those of this device with the same id. */
export const fonts = defineKind<CustomFont>({
  paths: [FONT_LIST_FILE, FONT_DIR],
  list: (where) =>
    where === "workspace"
      ? store.getState().workspaceFonts
      : store.getState().customFonts,
  save: async (where, items) => {
    if (where === "workspace") {
      await writeWorkspaceList(FONT_LIST_FILE, items);
      store.getState().setWorkspaceFonts(items);
    } else store.getState().setCustomFonts(items);
  },
  copy: async (font, to) => {
    if (!font.fileName) return { ...font, where: to };
    if (to === "workspace") {
      const data = await readFontData(font.id);
      if (!data) throw new Error(`The file of ${font.family} is missing`);
      const moved: CustomFont = {
        ...font,
        fileName: freeFileName(font, store.getState().workspaceFonts),
        where: to,
      };
      const ok = await invoke<boolean>("write_file_bytes", {
        filePath: workspaceFontPath(moved),
        data: Array.from(new Uint8Array(data)),
      });
      if (!ok) throw new Error(`Failed to copy ${font.family}`);
      return moved;
    }
    const data = await invoke<ArrayBuffer | number[]>("read_file_bytes", {
      filePath: workspaceFontPath(font),
    });
    await saveFontData(font.id, toBuffer(data));
    return { ...font, where: to };
  },
  remove: async (font, from) => {
    if (from === "device") await deleteFontData(font.id);
    else if (plainFileName(font.fileName))
      await invoke("delete_files", { paths: [workspaceFontPath(font)] });
  },
  load: async () =>
    store
      .getState()
      .setWorkspaceFonts(await readWorkspaceList<CustomFont>(FONT_LIST_FILE)),
});

/** The fonts added by the user: of the workspace, then of this device. */
export const allFonts = (state: {
  customFonts: CustomFont[];
  workspaceFonts: CustomFont[];
}) => merged(state.customFonts, state.workspaceFonts, "workspace");

/** The fonts added by the user, in a component */
export function useFonts(): CustomFont[] {
  const customFonts = useStore((state) => state.customFonts);
  const workspaceFonts = useStore((state) => state.workspaceFonts);
  return useMemo(
    () => allFonts({ customFonts, workspaceFonts }),
    [customFonts, workspaceFonts],
  );
}

/** Import a font file: keep it on this device and add it to the fonts. */
export async function importFont(
  file: File,
  family = familyOfFile(file.name),
): Promise<CustomFont> {
  const data = await file.arrayBuffer();
  // check it is a font before keeping it
  await new FontFace(family, data).load();
  const font: CustomFont = {
    id: crypto.randomUUID(),
    family,
    fileName: file.name,
    where: "device",
  };
  await saveFontData(font.id, data);
  const { customFonts, setCustomFonts } = store.getState();
  setCustomFonts([...customFonts, font]);
  return font;
}

let systemFonts: Promise<string[]> | undefined;

/**
 * The font families installed on the system, listed once (none on the
 * web, where a family is typed by its name).
 */
export function listSystemFonts(): Promise<string[]> {
  if (!isTauri) return Promise.resolve([]);
  systemFonts ??= invoke<string[]>("system_fonts")
    .then((list) => (Array.isArray(list) ? list : []))
    .catch((e) => {
      console.error("Failed to list the system fonts:", e);
      systemFonts = undefined;
      return [];
    });
  return systemFonts;
}

/** The font families installed on the system, in a component: [] until listed. */
export function useSystemFonts(): string[] {
  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void listSystemFonts().then((list) => {
      if (live) setFamilies(list);
    });
    return () => {
      live = false;
    };
  }, []);
  return families;
}

/** Add a font installed on the system, by its family name. */
export function addSystemFont(family: string): CustomFont {
  const font: CustomFont = {
    id: crypto.randomUUID(),
    family: family.trim(),
    fileName: "",
    where: "device",
  };
  const { customFonts, setCustomFonts } = store.getState();
  setCustomFonts([...customFonts, font]);
  return font;
}

/** Remove a font, from this device and from the workspace. */
export const removeFont = (id: string) => drop(fonts, id);

/** The bytes of an imported font, wherever it is kept */
async function fontData(font: CustomFont): Promise<ArrayBuffer | undefined> {
  if (font.where === "device") return readFontData(font.id);
  const data = dataRoot();
  if (!data || !plainFileName(font.fileName)) return undefined;
  return toBuffer(
    await invoke<ArrayBuffer | number[]>("read_file_bytes", {
      filePath: workspaceFontPath(font, data),
    }),
  );
}

// the fonts loaded in this window: their faces and blob URLs (for the book
// frames, which don't see the fonts of the document)
const loaded = new Map<string, { face: FontFace; url: string }>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version += 1;
  listeners.forEach((l) => l());
};

async function loadFonts(fonts: CustomFont[]) {
  for (const [id, { face, url }] of loaded) {
    if (fonts.some((f) => f.id === id)) continue;
    document.fonts.delete(face);
    URL.revokeObjectURL(url);
    loaded.delete(id);
  }
  for (const font of fonts) {
    if (!font.fileName || loaded.has(font.id)) continue;
    try {
      const data = await fontData(font);
      if (!data) continue;
      const face = new FontFace(font.family, data);
      await face.load();
      document.fonts.add(face);
      loaded.set(font.id, { face, url: URL.createObjectURL(new Blob([data])) });
    } catch (error) {
      console.error(`Failed to load font ${font.family}:`, error);
    }
  }
  notify();
}

/**
 * Load the fonts of the workspace opened, and the imported fonts in this
 * window; follow their changes.
 */
export function useCustomFonts() {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const all = useFonts();

  useEffect(() => {
    const data = dataRoot({ initDir, layout });
    if (!data) {
      store.getState().setWorkspaceFonts([]);
      return;
    }
    let live = true;
    void readWorkspaceList<CustomFont>(FONT_LIST_FILE, data).then((items) => {
      if (live) store.getState().setWorkspaceFonts(items);
    });
    return () => {
      live = false;
    };
  }, [initDir, layout]);

  useEffect(() => {
    void loadFonts(all);
  }, [all]);
}

/** Changes when fonts finish loading, to apply them again where needed. */
export const useFontsVersion = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );

/** `@font-face` rules for a frame using the font `id`, if it is imported. */
export function fontFaceCss(id: string, customFonts: CustomFont[]): string {
  const font = customFonts.find((f) => `custom:${f.id}` === id);
  const url = font && loaded.get(font.id)?.url;
  return url
    ? `@font-face { font-family: ${quote(font.family)}; src: url(${url}); }`
    : "";
}
