import { useEffect } from 'react';
import { create } from 'zustand';
import FileAPI from 'file/files';
import { store, useStore } from 'lib/store';
import {
  createIssue as createIssueOp, defaultIssueData, NewIssue, normalizeIssueData, renameNoteRefs,
} from './issueOps';
import { LEGACY_KANBAN_FILE, migrateKanbans, parseLegacyKanbans } from './migrateKanban';
import type { IssueData } from './types';

export const ISSUE_FILE = 'issues.json';
export const SAVE_DEBOUNCE_MS = 300;

type IssueStore = {
  data: IssueData;
  /** the workspace (initDir) data was loaded from; undefined until loaded */
  dir?: string;
  isLoaded: boolean;
  /** read issues.json in initDir; no-op if already loaded for that dir */
  load: (initDir: string, force?: boolean) => Promise<void>;
  /** apply a pure op (see issueOps) and schedule a save */
  apply: (op: (data: IssueData) => IssueData) => void;
  /** create an issue and return its number */
  createIssue: (input: NewIssue) => number;
  /** write pending changes now */
  flush: () => Promise<void>;
};

// Kept apart from the persisted main store: issues live in the workspace
// (initDir/issues.json), never in LOCAL_DATA_DIR.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: { dir: string; data: IssueData } | undefined;
let loadSeq = 0;

async function writeIssues(dir: string, data: IssueData) {
  await new FileAPI(ISSUE_FILE, dir).writeFile(JSON.stringify(data, null, 2));
}

/**
 * One-time move of the old kanban.json boards into Projects. issues.json is
 * written first, then kanban.json is kept as kanban.json.bak and removed, so
 * the boards are not imported twice. Only the issues.json format remains.
 */
async function migrateLegacyKanban(dir: string, data: IssueData, fresh: boolean) {
  const kanbanFile = new FileAPI(LEGACY_KANBAN_FILE, dir);
  let text = '';
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

  load: async (initDir: string, force = false) => {
    if (!force && get().dir === initDir && get().isLoaded) return;
    await get().flush();
    const seq = ++loadSeq;
    let data: IssueData;
    let fresh = false; // no issues.json yet
    try {
      const text = await new FileAPI(ISSUE_FILE, initDir).readFile();
      if (!text || !text.trim()) {
        fresh = true;
        data = defaultIssueData();
      } else {
        try {
          data = normalizeIssueData(JSON.parse(text));
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
    set({ data, dir: initDir, isLoaded: true });
  },

  apply: (op) => {
    const { data, dir } = get();
    const next = op(data);
    if (next === data) return;
    set({ data: next });
    if (!dir) return;
    pending = { dir, data: next };
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
      await writeIssues(toSave.dir, toSave.data);
    }
  },
}));

export const issueStore = useIssueStore;

/** Issue data of the open workspace, loading it on first use. */
export function useIssueData() {
  const initDir = useStore((state) => state.initDir);
  const load = useIssueStore((s) => s.load);
  const data = useIssueStore((s) => s.data);
  const dir = useIssueStore((s) => s.dir);
  const isLoaded = useIssueStore((s) => s.isLoaded);
  useEffect(() => {
    if (initDir) void load(initDir);
  }, [initDir, load]);
  return { data, isLoaded: isLoaded && dir === initDir, initDir };
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
  useIssueStore.setState({ data: defaultIssueData(), dir: undefined, isLoaded: false });
}
