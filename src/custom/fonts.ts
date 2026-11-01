import { useEffect, useSyncExternalStore } from "react";
import { store, useStore } from "@/state/store";

/**
 * The fonts of the app, one list for the editor and the reader. A font is
 * chosen by an id:
 * - `''` the default of the view (`book` in the reader: as the book says)
 * - `serif`, `sans-serif`, `monospace`: generic stacks
 * - a bundled family name, e.g. `Sniglet`
 * - `custom:<id>`: a font added by the user: a file imported, kept on this
 *   device, or a font installed on the system, by its name
 */
export type CustomFont = {
  id: string;
  family: string;
  /** the name of the file imported, '' for a system font */
  fileName: string;
};

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

const saveFontData = (id: string, data: ArrayBuffer) =>
  withStore("readwrite", (s) => s.put(data, id));
const readFontData = (id: string) =>
  withStore<ArrayBuffer | undefined>("readonly", (s) => s.get(id));
const deleteFontData = (id: string) =>
  withStore("readwrite", (s) => s.delete(id));

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
  };
  await saveFontData(font.id, data);
  const { customFonts, setCustomFonts } = store.getState();
  setCustomFonts([...customFonts, font]);
  return font;
}

/** Add a font installed on the system, by its family name. */
export function addSystemFont(family: string): CustomFont {
  const font: CustomFont = {
    id: crypto.randomUUID(),
    family: family.trim(),
    fileName: "",
  };
  const { customFonts, setCustomFonts } = store.getState();
  setCustomFonts([...customFonts, font]);
  return font;
}

export async function removeFont(id: string) {
  const { customFonts, setCustomFonts } = store.getState();
  setCustomFonts(customFonts.filter((f) => f.id !== id));
  await deleteFontData(id);
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
      const data = await readFontData(font.id);
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

/** Load the imported fonts in this window, and follow their changes. */
export function useCustomFonts() {
  const customFonts = useStore((state) => state.customFonts);
  useEffect(() => {
    void loadFonts(customFonts);
  }, [customFonts]);
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
