import { invoke } from '@tauri-apps/api/core';
import { flushSave } from 'file/pendingSaves';
import { joinPath, toWorkspacePath } from 'file/util';
import { ISSUE_FILE, issueDirOf, issueStore } from 'components/issue/issueStore';
import { LEGACY_KANBAN_FILE } from 'components/issue/migrateKanban';
import { writeIssueDir } from 'components/issue/issueFiles';
import type { Issue, IssueData } from 'components/issue/types';
import {
  CLIPS_DIR, DATA_DIR, LAYOUT_ENTRIES, READING_DIR, WRITING_DIR, initLayout,
} from './layout';

/** Data files of a legacy workspace: kept in .mdsilo/legacy/ once migrated. */
const LEGACY_DATA_FILES = [
  ISSUE_FILE, `${ISSUE_FILE}.bak`, LEGACY_KANBAN_FILE, `${LEGACY_KANBAN_FILE}.bak`,
];
/** The notes snapshot of old versions, no longer read or written. */
const NOTES_SNAPSHOT = 'mdsilo.json';
export const LEGACY_DIR = 'legacy';

export type MigrationResult = {
  /** entries moved, by their name at the root */
  moved: string[];
  /** entries left at the root: the target exists already */
  skipped: string[];
};

/**
 * Where an entry of a legacy workspace goes: clips/ is input, to reading/,
 * the notes and anything else to writing/.
 */
export function migratedRelPath(rel: string): string {
  const top = rel.split('/')[0];
  if (LAYOUT_ENTRIES.has(top)) return rel;
  return top === CLIPS_DIR ? `${READING_DIR}/${rel}` : `${WRITING_DIR}/${rel}`;
}

/** The path of a file of the workspace after migration; outside it, as is. */
export function migratedPath(ws: string, path: string): string {
  const rel = toWorkspacePath(ws, path);
  return rel === path ? path : joinPath(ws, migratedRelPath(rel));
}

const mapIssuePaths = (data: IssueData, map: (path: string) => string): IssueData => ({
  ...data,
  issues: data.issues.map((issue) => ({
    ...issue,
    notes: issue.notes.map(map),
    ...(issue.noteTask ? { noteTask: { ...issue.noteTask, note: map(issue.noteTask.note) } } : {}),
  })),
});

const exists = (path: string) => invoke<boolean>('file_exist', { filePath: path });

/**
 * Move a legacy workspace into the workspace layout:
 * the notes into writing/, clips/ into reading/, issues.json into one file
 * per issue in .mdsilo/issues/; the old data files are kept in .mdsilo/legacy/.
 * Links between notes keep working: wiki links are by title, and the
 * `./assets/` paths are relative to writing/ from now on.
 *
 * The caller opens the workspace again afterwards.
 */
export async function migrateToWorkspace(ws: string): Promise<MigrationResult> {
  await flushSave();
  // the issues as they are, kanban.json migrated if any
  await issueStore.getState().load(ws, true, 'legacy');
  await issueStore.getState().flush();
  const issues = issueStore.getState().data;

  for (const dir of [READING_DIR, WRITING_DIR, joinPath(DATA_DIR, LEGACY_DIR)]) {
    await invoke('create_dir_recursive', { dirPath: joinPath(ws, dir) });
  }

  const result: MigrationResult = { moved: [], skipped: [] };
  const entries = await invoke<{ file_name: string; is_hidden: boolean }[]>(
    'list_directory', { dir: ws }
  );
  for (const { file_name: name, is_hidden } of entries ?? []) {
    if (is_hidden || LAYOUT_ENTRIES.has(name)) continue;
    const from = joinPath(ws, name);
    if (name === NOTES_SNAPSHOT) {
      await invoke('delete_files', { paths: [from] });
      continue;
    }
    const to = LEGACY_DATA_FILES.includes(name)
      ? joinPath(ws, DATA_DIR, LEGACY_DIR, name)
      : joinPath(ws, migratedRelPath(name));
    if (await exists(to)) {
      result.skipped.push(name);
      continue;
    }
    if (await invoke<boolean>('rename_file', { fromPath: from, toPath: to })) {
      result.moved.push(name);
    } else {
      result.skipped.push(name);
    }
  }

  // the issues, with the note paths where the notes are now
  const migrated = mapIssuePaths(issues, (path) => migratedPath(ws, path));
  const toStored = (issue: Issue) => ({
    ...issue,
    notes: issue.notes.map((path) => toWorkspacePath(ws, path)),
    ...(issue.noteTask
      ? { noteTask: { ...issue.noteTask, note: toWorkspacePath(ws, issue.noteTask.note) } }
      : {}),
  });
  if (migrated.issues.length > 0 || (await exists(joinPath(ws, DATA_DIR, LEGACY_DIR, ISSUE_FILE)))) {
    await writeIssueDir(issueDirOf(ws), undefined, migrated, toStored);
  }

  // the marker last: an interrupted migration is still a legacy workspace
  await initLayout(ws);
  return result;
}
