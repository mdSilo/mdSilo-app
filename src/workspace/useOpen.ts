import { invoke } from "@tauri-apps/api/core";
import { NoteMap, store, type Store } from "@/state/store";
import {
  openDirDilog,
  openDir,
  listDir,
  openFilePaths,
  openFileDilog,
  saveDilog,
  loadDir,
  openJSONFilePath,
} from "@/workspace/open";
import {
  normalizeSlash,
  getDirPath,
  getBaseName,
  joinPaths,
  isWeb,
} from "@/workspace/util";
import DirectoryAPI from "@/workspace/directory";
import { writeAllFile, writeFile } from "@/workspace/write";
import { rmFileNameExt } from "@/workspace/process";
import { READING_DIR, WRITING_DIR, resolveLayout } from "@/workspace/layout";
import { syncFeeds } from "@/feed/feedSync";

const openFiles = async (multi = true) => {
  const filePaths = await openFileDilog(["md"], multi);
  // console.log("file path", filePaths);
  const openPaths = typeof filePaths === "string" ? [filePaths] : filePaths;
  if (openPaths && openPaths.length > 0) {
    const onePath = openPaths[0];
    const parentDir = await getDirPath(onePath);
    // console.log("dir path", parentDir);
    cleanStore();
    store.getState().setCurrentDir(parentDir);
    store.getState().upsertRecentDir(parentDir);
    await openFilePaths(openPaths);
  }
};

export const onOpenFile = async () => await openFiles();

export const onOpenDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === "string") {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    await setWorkspace(normalizedDir);
    store.getState().setCurrentDir(normalizedDir);
    store.getState().upsertRecentDir(normalizedDir);
    // console.log("rencent dir path", store.getState().recentDir);
    await openDir(normalizedDir);
    await expandLayoutRoots(normalizedDir);
  }
};

/** Set the folder as the workspace, with its layout (see workspace/layout). */
async function setWorkspace(dir: string) {
  const layout = await resolveLayout(dir);
  store.getState().setLayout(layout);
  store.getState().setInitDir(dir);
  // the feeds of the workspace, e.g. subscribed on another device
  if (layout === "workspace") void syncFeeds();
}

/** In the workspace layout, the sidebar shows reading/ and writing/ expanded. */
async function expandLayoutRoots(dir: string) {
  if (store.getState().layout !== "workspace") return;
  for (const name of [READING_DIR, WRITING_DIR]) {
    const root = await joinPaths(dir, [name]);
    await listDir(root, false);
    store.getState().toggleExpandedDir(normalizeSlash(root), true);
  }
}

// used for list init dir:
// SidebarNotes init Open Folder,
// File Drop(SidebarNotesBar Dropdown-Folder, SideMenu/FileButton Dropdown-Folder)
export const onListDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === "string") {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    // console.log("rencent dir path", store.getState().recentDir);
    await listInitDir(normalizedDir);
  }
};

// use for list init dir
// onListDir
// SidebarHistory, to recent dir
/** Opening a folder taking longer than this shows what it waits on. */
export const OPEN_SLOW_MS = 8000;
let reporting = 0;

/**
 * Run an opening of a folder, telling in the explorer (openProblem) what
 * fails, or what it waits on if it takes long: on a phone, there is no
 * console to look at.
 */
export async function reportOpening<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  // within another one: that one tells
  if (reporting > 0) return run();
  reporting += 1;
  const { setOpenProblem } = store.getState();
  setOpenProblem(undefined);
  const slow = setTimeout(() => {
    void stuckOn().then((on) =>
      setOpenProblem(
        `${label} is taking long${on ? `, waiting on ${on}` : ""}.`,
      ),
    );
  }, OPEN_SLOW_MS);
  try {
    const result = await run();
    setOpenProblem(undefined);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    setOpenProblem(`${label} failed: ${msg}`);
    throw e;
  } finally {
    clearTimeout(slow);
    reporting -= 1;
  }
}

/**
 * The settings loading for long (web: from IndexedDB): the folder is opened
 * once they are, tell what it waits on. Cancel once loaded.
 */
export function reportSlowSettings(): { cancel: () => void } {
  const slow = setTimeout(() => {
    void stuckOn().then((on) =>
      store
        .getState()
        .setOpenProblem(
          `Loading the settings is taking long${on ? `, waiting on ${on}` : ""}.`,
        ),
    );
  }, OPEN_SLOW_MS);
  return { cancel: () => clearTimeout(slow) };
}

/** The commands running for long, web: the store in the browser. */
async function stuckOn(): Promise<string> {
  if (!isWeb) return "";
  const { stuckCommands } = await import("@/host/web/core");
  return stuckCommands(OPEN_SLOW_MS / 2)
    .slice(0, 3)
    .map((c) => `${c.cmd} (${Math.round(c.ms / 1000)}s)`)
    .join(", ");
}

export const listInitDir = (dirPath: string) =>
  reportOpening(`Opening ${dirPath}`, () => listInitDirNow(dirPath));

const listInitDirNow = async (dirPath: string) => {
  try {
    await setWorkspace(dirPath);
    store.getState().upsertRecentDir(dirPath);
    // listen on init dir only
    await listDir(dirPath);
    await expandLayoutRoots(dirPath);
    // the folder shows (the explorer, the views of a folder) once it is
    // listed: not as an empty one meanwhile, or for good if listing fails
    store.getState().setCurrentDir(dirPath);
  } catch (e) {
    // back to no folder, where the history can be clicked again
    if (store.getState().initDir === dirPath) {
      store.getState().setInitDir(undefined);
      store.getState().setLayout(undefined);
      store.getState().setCurrentDir(undefined);
    }
    throw e;
  }
  // all notes with content, e.g. for backlinks and search
  void loadDir(dirPath);
};

/** Open the workspace again from scratch, e.g. once its layout changed. */
export const reopenWorkspace = async (dirPath: string) => {
  cleanStore();
  await listInitDir(dirPath);
};

/** The folder to open on startup as the setting says, '' for none. */
export const startupDir = (
  state: Pick<Store, "openOnStartup" | "recentDir" | "pinnedDir">,
): string => {
  if (state.openOnStartup === "previous") {
    const recent = state.recentDir ?? [];
    return recent[recent.length - 1] ?? "";
  }
  return state.openOnStartup === "pinned" ? state.pinnedDir : "";
};

let isWebWorkspaceOpening = false;

const OPEN_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Web: notes live in IndexedDB, there is always a folder to work in. Open the
 * folder of the setting (previous or pinned), the pinned folder, or the
 * default workspace `/mdSilo`, so the views depending on a folder (issues,
 * chronicle, graph...) are available on startup. A failure (e.g. the browser
 * closed the database meanwhile) is tried again.
 */
export const openWebWorkspace = async (): Promise<string | undefined> => {
  if (store.getState().currentDir || isWebWorkspaceOpening) return;
  isWebWorkspaceOpening = true;
  try {
    return await reportOpening("Opening the workspace", retryOpening);
  } finally {
    isWebWorkspaceOpening = false;
  }
};

async function retryOpening(): Promise<string | undefined> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openWebWorkspaceOnce();
    } catch (e) {
      console.error(`Failed to open the workspace (${attempt}):`, e);
      if (attempt >= OPEN_ATTEMPTS) throw e;
      await sleep(500 * attempt);
      // opened meanwhile, e.g. by a click on the history
      if (store.getState().currentDir) return;
    }
  }
}

async function openWebWorkspaceOnce(): Promise<string | undefined> {
  const state = store.getState();
  const candidates = [startupDir(state), state.pinnedDir].filter(
    (d): d is string => Boolean(d),
  );
  for (const dir of candidates) {
    let isDir = false;
    try {
      isDir = await new DirectoryAPI(dir).isDir();
    } catch (e) {
      console.error(`Failed to check ${dir}:`, e);
    }
    if (isDir) {
      await listInitDir(normalizeSlash(dir));
      return dir;
    }
  }
  // create the default workspace if missing
  const dir = await invoke<string>("create_mdsilo_dir");
  if (dir && !store.getState().currentDir) {
    await listInitDir(normalizeSlash(dir));
    return dir;
  }
}

// use for list sub-dir:
// SidebarNoteLink, to sub-dir
// SidebarNotesBar, to upper-dir
export const listDirPath = async (dirPath: string, noCache = true) => {
  // console.log("dir path", dirPath);
  const normalizedDir = await getDirPath(dirPath);
  store.getState().setCurrentDir(normalizedDir);
  if (noCache) {
    store.getState().setNoteTree({});
    store.getState().setExpandedDirs({});
    // console.log("rencent dir path", store.getState().recentDir);
    await listDir(normalizedDir, false);
  } else {
    const itemList = store.getState().noteTree[normalizedDir];
    if (!itemList) {
      await listDir(normalizedDir, false);
    }
  }
};

export const openJsonFile = async () => {
  const onePath = await openFileDilog(["json"], false);
  // console.log("json file path", onePath, typeof onePath);
  if (onePath && typeof onePath === "string") {
    // workflow:
    // 0- open json file
    const jsonData = await openJSONFilePath(onePath);
    // console.log('json data: ', jsonData);
    if (jsonData) {
      // 1- build a folder to save markdown files
      const parentDir = await getDirPath(onePath);
      const jsonName = (await getBaseName(onePath))[0];
      const dirName = await joinPaths(parentDir, [rmFileNameExt(jsonName)]);
      // 2- json to markdown files and save
      const notes = Object.values(jsonData.notesobj);
      for (const note of notes) {
        const title = note.title;
        const content = note.content;
        const filePath = await joinPaths(dirName, [`${title}.md`]);
        await writeFile(filePath, content);
      }
      // 3- open that folder
      await listInitDir(dirName);
    }
  }
};

export const onSave = async () => {
  const dir = await saveDilog("mdsiloFolder");
  if (!dir) return;
  const normalizedDir = normalizeSlash(dir);
  // console.log("save dir path", dir, normalizedDir);
  const notesObj = store.getState().notes;
  await writeAllFile(normalizedDir, notesObj);
  store.getState().setCurrentDir(normalizedDir);
};

function cleanStore() {
  // cleaning store, *first tree then notes*
  store.getState().setNoteTree({});
  store.getState().setExpandedDirs({});
  store.getState().setNotes(NoteMap.EMPTY);
  store.getState().setCurrentDir(undefined);
  store.getState().setCurrentNoteId("");
  store.getState().setLayout(undefined);
  store.getState().setIsLoaded(false);
  store.getState().setIsLoading(false);
}
