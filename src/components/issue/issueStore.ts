import { useEffect } from 'react';
import { create } from 'zustand';
import FileAPI from '@/file/files';
import { fromWorkspacePath, toWorkspacePath } from '@/file/util';
import { store, useStore } from '@/state/store';
import { dataDirOf, type Layout } from '@/workspace/layout';
import {
  createIssue as createIssueOp, defaultIssueData, NewIssue, normalizeIssueData, renameNoteRefs,
} from './issueOps';
import { LEGACY_KANBAN_FILE, migrateKanbans, parseLegacyKanbans } from './migrateKanban';
import { ISSUES_DIR, readIssueDir, writeIssueDir } from './issueFiles';
import type { Issue, IssueData } from './types';

export const ISSUE_FILE = 'issues.json';
export const SAVE_DEBOUNCE_MS = 300;

type IssueStore = {
  data: IssueData;
  /** the workspace (initDir) data was loaded from; undefined until loaded */
  dir?: string;
  /** legacy: initDir/issues.json; workspace: one file per issue, see issueFiles */
  layout?: Layout;
  isLoaded: boolean;
  /**
   * read the issues of initDir; no-op if already loaded for that dir. The
   * layout defaults to the one of the open workspace.
   */
  load: (initDir: string, force?: boolean, layout?: Layout) => Promise<void>;
  /** apply a pure op (see issueOps) and schedule a save */
  apply: (op: (data: IssueData) => IssueData) => void;
  /** create an issue and return its number */
  createIssue: (input: NewIssue) => number;
  /** write pending changes now */
  flush: () => Promise<void>;
};

// Kept apart from the persisted main store: issues live in the workspace
// (initDir/issues.json, or .mdsilo/issues/), never in LOCAL_DATA_DIR.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: { dir: string; layout: Layout; data: IssueData } | undefined;
let loadSeq = 0;
// the data as last read or written per workspace, to write the changes only
const saved = new Map<string, IssueData>();

/** The note paths of an issue, mapped. */
function mapIssuePaths(issue: Issue, map: (path: string) => string): Issue {
  return {
    ...issue,
    notes: issue.notes.map(map),
    ...(issue.noteTask ? { noteTask: { ...issue.noteTask, note: map(issue.noteTask.note) } } : {}),
  };
}

/** The note paths of the data, mapped: relative in the file, absolute in the app. */
function mapNotePaths(data: IssueData, map: (path: string) => string): IssueData {
  return { ...data, issues: data.issues.map((issue) => mapIssuePaths(issue, map)) };
}

/** The dir of the issue files of a workspace in the workspace layout. */
export const issueDirOf = (dir: string) => `${dataDirOf(dir)}/${ISSUES_DIR}`;

/** The layout of a workspace: the open one's, legacy for any other. */
const layoutOf = (dir: string): Layout => {
  const { initDir, layout } = store.getState();
  return initDir === dir && layout ? layout : 'legacy';
};

/** as stored: paths relative to the workspace, so it can move (clone, sync) */
export const toStoredIssueData = (dir: string, data: IssueData) =>
  mapNotePaths(data, (path) => toWorkspacePath(dir, path));

/** as used: absolute paths; older files have them absolute already */
export const fromStoredIssueData = (dir: string, data: IssueData) =>
  mapNotePaths(data, (path) => fromWorkspacePath(dir, path));

async function writeIssues(dir: string, data: IssueData, layout: Layout = 'legacy') {
  if (layout === 'workspace') {
    const toStored = (issue: Issue) => mapIssuePaths(issue, (path) => toWorkspacePath(dir, path));
    await writeIssueDir(issueDirOf(dir), saved.get(dir), data, toStored);
  } else {
    const stored = toStoredIssueData(dir, data);
    await new FileAPI(ISSUE_FILE, dir).writeFile(JSON.stringify(stored, null, 2));
  }
  saved.set(dir, data);
}

/** Read the issues of a workspace in the workspace layout. */
async function readIssues(dir: string): Promise<IssueData> {
  try {
    const data = await readIssueDir(issueDirOf(dir));
    return data ? fromStoredIssueData(dir, data) : defaultIssueData();
  } catch {
    // e.g. not in Tauri
    return defaultIssueData();
  }
}

/**
 * One-time move of the old kanban.json boards into Projects. issues.json is
 * written first, then kanban.json is kept as kanban.json.bak and removed, so
 * the boards are not imported twice. Only the issues.json format remains.
 */
async function migrateLegacyKanban(dir: string, data: IssueData, fresh: boolean) {
  const kanbanFile = new FileAPI(LEGACY_KANBAN_FILE, dir);
  let text: string;
  try {
    text = await kanbanFile.readFile();
  } catch {
    return data; // no file system
  }
  const kanbans = parseLegacyKanbans(text);
  if (!kanbans) return data;
  const migrated = migrateKanbans(data, kanbans, fresh);
  try {
    await writeIssues(dir, migrated);
    await new FileAPI(`${LEGACY_KANBAN_FILE}.bak`, dir).writeFile(text);
    // if deleting fails, an empty board list keeps it from being imported again
    const deleted = await kanbanFile.deleteFiles().catch(() => false);
    if (!deleted) await kanbanFile.writeFile('{}');
  } catch (e) {
    console.error('Failed to migrate kanban.json', e);
    return data;
  }
  return migrated;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
  data: defaultIssueData(),
  dir: undefined,
  isLoaded: false,

  load: async (initDir: string, force = false, layout = layoutOf(initDir)) => {
    const loaded = get();
    if (!force && loaded.dir === initDir && (loaded.layout ?? 'legacy') === layout && loaded.isLoaded) return;
    await get().flush();
    const seq = ++loadSeq;
    if (layout === 'workspace') {
      const data = await readIssues(initDir);
      if (seq !== loadSeq) return; // a newer load won
      saved.set(initDir, data);
      set({ data, dir: initDir, layout, isLoaded: true });
      return;
    }
    let data: IssueData;
    let fresh = false; // no issues.json yet
    try {
      const text = await new FileAPI(ISSUE_FILE, initDir).readFile();
      if (!text || !text.trim()) {
        fresh = true;
        data = defaultIssueData();
      } else {
        try {
          data = fromStoredIssueData(initDir, normalizeIssueData(JSON.parse(text)));
        } catch (e) {
          // keep the broken file around before it gets overwritten
          console.error('issues.json is not valid JSON, starting over', e);
          await new FileAPI(`${ISSUE_FILE}.bak`, initDir).writeFile(text).catch(() => undefined);
          data = defaultIssueData();
        }
      }
    } catch (e) {
      // e.g. not in Tauri
      data = defaultIssueData();
    }
    data = await migrateLegacyKanban(initDir, data, fresh);
    if (seq !== loadSeq) return; // a newer load won
    saved.set(initDir, data);
    set({ data, dir: initDir, layout, isLoaded: true });
  },

  apply: (op) => {
    const { data, dir, layout = 'legacy' } = get();
    const next = op(data);
    if (next === data) return;
    set({ data: next });
    if (!dir) return;
    pending = { dir, layout, data: next };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void get().flush(); }, SAVE_DEBOUNCE_MS);
  },

  createIssue: (input) => {
    const num = get().data.nextNumber;
    get().apply((d) => createIssueOp(d, input));
    return num;
  },

  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    const toSave = pending;
    pending = undefined;
    if (toSave) {
      await writeIssues(toSave.dir, toSave.data, toSave.layout);
    }
  },
}));

export const issueStore = useIssueStore;

/** Issue data of the open workspace, loading it on first use. */
export function useIssueData() {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const load = useIssueStore((s) => s.load);
  const data = useIssueStore((s) => s.data);
  const dir = useIssueStore((s) => s.dir);
  const loadedLayout = useIssueStore((s) => s.layout);
  const isLoaded = useIssueStore((s) => s.isLoaded);
  useEffect(() => {
    if (initDir) void load(initDir);
  }, [initDir, layout, load]);
  const sameLayout = (loadedLayout ?? 'legacy') === (layout ?? 'legacy');
  return { data, isLoaded: isLoaded && dir === initDir && sameLayout, initDir };
}

/** On note rename: keep issue links to the note working. */
export async function updateIssueNoteLinks(
  oldPath: string, newPath: string, oldTitle: string, newTitle: string
) {
  const initDir = store.getState().initDir;
  if (!initDir) return;
  await useIssueStore.getState().load(initDir);
  useIssueStore.getState().apply((d) => renameNoteRefs(d, oldPath, newPath, oldTitle, newTitle));
}

/** Reset module state; for tests. */
export function resetIssueStore() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  pending = undefined;
  loadSeq += 1;
  saved.clear();
  useIssueStore.setState({ data: defaultIssueData(), dir: undefined, layout: undefined, isLoaded: false });
}
