import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import {
  buildSite, DEFAULT_OPTIONS, type PublishOptions, type Renderers, type SiteBook, type SiteInput, type SiteIssue,
  type SiteMilestone, type SiteNote, type SiteProject,
} from 'mdsilo-publish';
import { store } from '@/state/store';
import { withContents } from '@/lib/contentCache';
import type { Note } from '@/types/model';
import { checkFileIsMd } from '@/workspace/process';
import { flushSave } from '@/workspace/pendingSaves';
import { DATA_DIR, LOCAL_DIR } from '@/workspace/layout';
import { isTauri, isWeb, joinPath } from '@/workspace/util';
import { useIssueStore } from '@/issue/issueStore';
import { annotationsPathOf } from '@/reader/annotations';
import { loadBooks } from '@/reader/books';
import { siteRenderers } from './renderers';

/**
 * The static site of the workspace, built by packages/publish: written to a
 * folder, or pushed to the `gh-pages` branch of the remote of the sync. What
 * to publish is kept in `.mdsilo/publish.json`, synced with the workspace.
 * Desktop and mobile only, as the sync.
 */
export const isPublishAvailable = isTauri && !isWeb;

export const PUBLISH_FILE = 'publish.json';
/** the site as last built, to push: device local */
export const SITE_DIR = 'site';

/** The dialog, opened from the file menu. */
export const usePublishUi = create<{ isOpen: boolean }>(() => ({ isOpen: false }));

const settingsPath = (ws: string) => joinPath(ws, DATA_DIR, PUBLISH_FILE);
export const siteDirOf = (ws: string) => joinPath(ws, DATA_DIR, LOCAL_DIR, SITE_DIR);

export async function readPublishOptions(ws: string): Promise<PublishOptions> {
  try {
    const text = await invoke<string>('read_file', { filePath: settingsPath(ws) });
    return { ...DEFAULT_OPTIONS, ...(text?.trim() ? (JSON.parse(text) as Partial<PublishOptions>) : {}) };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export async function writePublishOptions(ws: string, options: PublishOptions) {
  await invoke('create_dir_recursive', { dirPath: joinPath(ws, DATA_DIR) });
  await invoke('write_file', { filePath: settingsPath(ws), text: `${JSON.stringify(options, null, 2)}\n` });
}

/** `/ws/writing/a.md` -> `writing/a.md`; undefined if out of the workspace. */
export const relativeTo = (ws: string, path: string) => {
  const root = ws.replace(/\/+$/, '');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
};

/** The folders of notes, relative, each with its parents: to tick. */
export function noteFolders(ws: string, notes: readonly Note[] = store.getState().notes.values()): string[] {
  const folders = new Set<string>();
  for (const note of notes) {
    if (note.is_dir || !checkFileIsMd(note.id)) continue;
    const parts = relativeTo(ws, note.id)?.split('/').slice(0, -1) ?? [];
    for (let i = 1; i <= parts.length; i += 1) {
      const folder = parts.slice(0, i).join('/');
      if (!folder.startsWith('.')) folders.add(folder);
    }
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

/** What the site is made of, read from the workspace. */
export async function gatherSite(ws: string, options: PublishOptions): Promise<SiteInput> {
  await flushSave();
  await useIssueStore.getState().flush();
  const mdNotes = store.getState().notes.values().filter((n) => !n.is_dir && checkFileIsMd(n.id));
  const notes: SiteNote[] = [];
  for (const note of await withContents(mdNotes)) {
    const path = relativeTo(ws, note.id);
    if (!path) continue;
    notes.push({ path, title: note.title, content: note.content, created: note.created_at, updated: note.updated_at });
  }

  const books: SiteBook[] = [];
  if (options.books) {
    const paths = new Set(notes.map((n) => n.path));
    for (const entry of Object.values(await loadBooks())) {
      const annotations = annotationsPathOf(entry.file);
      books.push({ id: entry.hash, title: entry.title, author: entry.author, annotations: paths.has(annotations) ? annotations : undefined });
    }
  }

  const issues: SiteIssue[] = [];
  const milestones: SiteMilestone[] = [];
  const projects: SiteProject[] = [];
  if (options.issues) {
    await useIssueStore.getState().load(ws);
    const data = useIssueStore.getState().data;
    const labelOf = new Map(data.labels.map((l) => [l.id, { name: l.name, color: l.color }]));
    // the links to notes, by path in the workspace
    const rel = (path: string) => relativeTo(ws, path) ?? path;
    for (const issue of data.issues) {
      issues.push({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        closedAt: issue.closedAt,
        labels: issue.labels.flatMap((id) => labelOf.get(id) ?? []),
        milestone: issue.milestone,
        dueOn: issue.dueOn,
        subtasks: (issue.subtasks ?? []).map((s) => ({ text: s.text, done: s.done })),
        notes: issue.notes.map(rel),
        task: issue.noteTask ? { note: rel(issue.noteTask.note), text: issue.noteTask.text } : undefined,
        timeline: issue.timeline.map((t) =>
          t.kind === 'comment'
            ? { kind: 'comment', body: t.body, createdAt: t.createdAt }
            : { kind: 'event', event: t.event, detail: t.detail, createdAt: t.createdAt }
        ),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      });
    }
    for (const m of data.milestones) {
      milestones.push({ id: m.id, title: m.title, description: m.description, dueOn: m.dueOn, state: m.state });
    }
    for (const p of data.projects) {
      projects.push({
        id: p.id,
        title: p.title,
        description: p.description,
        statuses: p.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
        items: p.items.map((i) => ({ issue: i.issue, status: i.status, order: i.order })),
      });
    }
  }
  return { notes, books, issues, milestones, projects, options };
}

export type Built = { pages: number; files: number; missing: string[] };

/**
 * Build the site into a folder: the site dir of the app (emptied first) to
 * publish, or a folder chosen to export to (written over, not emptied).
 */
export async function buildSiteTo(
  ws: string, options: PublishOptions, target = siteDirOf(ws), renderers: Renderers = siteRenderers
): Promise<Built> {
  const files = await buildSite(await gatherSite(ws, options), renderers);
  const clear = target === siteDirOf(ws);
  const written = await invoke<{ files: number; missing: string[] }>('publish_write', { dir: ws, target, files, clear });
  const pages = files.filter((f) => f.path.endsWith('.html')).length;
  return { pages, files: written.files, missing: written.missing };
}

export type Pushed = { branch: string; url?: string };

/** Build the site and push it to the `gh-pages` branch of the remote. */
export async function publishSite(ws: string, options: PublishOptions, renderers?: Renderers): Promise<Built & Pushed> {
  const built = await buildSiteTo(ws, options, siteDirOf(ws), renderers);
  const pushed = await invoke<Pushed>('publish_push', { dir: ws, site: siteDirOf(ws) });
  return { ...built, ...pushed };
}
