import { invoke } from '@tauri-apps/api/core';
import { joinPath } from '@/file/util';
import { normalizeIssueData } from './issueOps';
import { ISSUE_DATA_VERSION, type Issue, type IssueData } from './types';

/**
 * Issues in the workspace layout: one file per issue, so two devices editing
 * different issues sync without conflicts.
 *
 *   .mdsilo/issues/meta.json   nextNumber, labels, milestones, projects
 *   .mdsilo/issues/12.json     issue #12
 */
export const ISSUES_DIR = 'issues';
export const META_FILE = 'meta.json';

export type IssueMeta = Omit<IssueData, 'issues'>;

const ISSUE_FILE_REGEX = /^(\d+)\.json$/;

const readText = (dir: string, name: string) =>
  invoke<string>('read_file', { filePath: joinPath(dir, name) });
const writeText = (dir: string, name: string, text: string) =>
  invoke('write_file', { filePath: joinPath(dir, name), text });

export const issueFileName = (num: number) => `${num}.json`;

export function splitIssueData(data: IssueData): { meta: IssueMeta; issues: Issue[] } {
  const { issues, ...meta } = data;
  return { meta, issues };
}

/** The data of the meta and the issues read, normalized. */
export function joinIssueData(meta: unknown, issues: unknown[]): IssueData {
  const base = (meta && typeof meta === 'object' ? meta : {}) as Record<string, unknown>;
  const sorted = [...issues].sort(
    (a, b) => ((a as Issue)?.number ?? 0) - ((b as Issue)?.number ?? 0)
  );
  return normalizeIssueData({ ...base, version: ISSUE_DATA_VERSION, issues: sorted });
}

export type IssueChanges = {
  /** the issues new or changed */
  write: Issue[];
  /** the numbers of the issues deleted */
  remove: number[];
  /** nextNumber, labels, milestones or projects changed */
  meta: boolean;
};

/**
 * What to write to go from the saved data to the next: issue ops return new
 * objects for what they change, so comparing references is enough.
 */
export function issueChanges(prev: IssueData | undefined, next: IssueData): IssueChanges {
  if (!prev) {
    return { write: next.issues, remove: [], meta: true };
  }
  const before = new Map(prev.issues.map((issue) => [issue.number, issue]));
  const write = next.issues.filter((issue) => before.get(issue.number) !== issue);
  const after = new Set(next.issues.map((issue) => issue.number));
  const remove = prev.issues.map((issue) => issue.number).filter((num) => !after.has(num));
  const meta =
    prev.nextNumber !== next.nextNumber ||
    prev.labels !== next.labels ||
    prev.milestones !== next.milestones ||
    prev.projects !== next.projects;
  return { write, remove, meta };
}

/** Read the issues dir; undefined if there is none yet. */
export async function readIssueDir(dir: string): Promise<IssueData | undefined> {
  const metaText = await readText(dir, META_FILE);
  const entries = await invoke<{ file_name: string }[]>('list_directory', { dir });
  const issueFiles = (entries ?? []).filter((e) => ISSUE_FILE_REGEX.test(e.file_name));
  if (!metaText?.trim() && issueFiles.length === 0) return undefined;
  let meta: unknown = {};
  try {
    meta = metaText?.trim() ? JSON.parse(metaText) : {};
  } catch (e) {
    console.error(`${META_FILE} of the issues is not valid JSON`, e);
  }
  const issues: unknown[] = [];
  for (const entry of issueFiles) {
    const text = await readText(dir, entry.file_name);
    try {
      issues.push(JSON.parse(text));
    } catch (e) {
      // one broken issue does not lose the others
      console.error(`Issue file ${entry.file_name} is not valid JSON`, e);
    }
  }
  return joinIssueData(meta, issues);
}

/**
 * Write the changes from the saved data. `toStored` maps an issue as written
 * (note paths relative); compared before it, as the app keeps the data.
 */
export async function writeIssueDir(
  dir: string,
  prev: IssueData | undefined,
  next: IssueData,
  toStored: (issue: Issue) => Issue = (issue) => issue,
) {
  const changes = issueChanges(prev, next);
  if (changes.write.length || changes.meta) {
    await invoke('create_dir_recursive', { dirPath: dir });
  }
  for (const issue of changes.write) {
    await writeText(dir, issueFileName(issue.number), JSON.stringify(toStored(issue), null, 2));
  }
  if (changes.remove.length) {
    await invoke('delete_files', {
      paths: changes.remove.map((num) => joinPath(dir, issueFileName(num))),
    });
  }
  if (changes.meta) {
    const { meta } = splitIssueData(next);
    await writeText(dir, META_FILE, JSON.stringify(meta, null, 2));
  }
}
