import { produce } from 'immer';
import { genId } from 'utils/helper';
import { createIssue } from './issueOps';
import type { IssueData, ProjectStatus } from './types';

/*
 * The free-form Kanban (kanban.json) was merged into Projects.
 * These are its old data types, kept only to read and convert old files.
 */

export const LEGACY_KANBAN_FILE = 'kanban.json';

type LegacyId = string | number;

export type LegacyColumn = {
  id: LegacyId;
  title: string;
  hdColor?: string;
  bgColor?: string;
  ftColor?: string;
};

export type LegacyCardItem = {
  name: string;
  uri: string;
  category: string; // note, attach, ...
};

export type LegacyCard = {
  id: LegacyId;
  columnId: LegacyId;
  content: string;
  bgColor?: string;
  ftColor?: string;
  items?: LegacyCardItem[];
};

export type LegacyBoard = {
  columns: LegacyColumn[];
  cards: LegacyCard[];
  bgColor?: string;
  bgImg?: string;
};

export type LegacyKanbans = Record<string, LegacyBoard>; // {board name: data}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Parse kanban.json text; undefined when there is nothing to migrate. */
export function parseLegacyKanbans(text: string): LegacyKanbans | undefined {
  if (!text || !text.trim()) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const boards: LegacyKanbans = {};
  for (const [name, b] of Object.entries(raw as Record<string, Partial<LegacyBoard>>)) {
    if (!b || typeof b !== 'object') continue;
    const columns = arr<LegacyColumn>(b.columns).filter((c) => c && c.id !== undefined);
    const cards = arr<LegacyCard>(b.cards).filter((c) => c && c.id !== undefined);
    if (columns.length || cards.length) boards[name] = { ...b, columns, cards };
  }
  return Object.keys(boards).length ? boards : undefined;
}

/** First line of a card is the issue title, the rest is its body. */
function splitContent(content: string) {
  const lines = (content ?? '').trim().split('\n');
  const title = lines[0]?.trim() || 'Untitled';
  const body = lines.slice(1).join('\n').trim();
  return { title, body };
}

const isNoteItem = (it: LegacyCardItem) => it.category === 'note';

/**
 * Convert old Kanban boards into Projects: every board becomes a project,
 * its columns become statuses (header color kept), its cards become issues
 * in the matching column, in the same order. Notes attached to a card become
 * linked notes of the issue, other attachments become links in the body.
 * Card and board colors/background images are not carried over.
 *
 * `replaceEmptyDefault`: drop the untouched "Default" project of a fresh
 * workspace so the old boards are what the user sees first.
 */
export function migrateKanbans(
  data: IssueData, kanbans: LegacyKanbans, replaceEmptyDefault = false
): IssueData {
  let next = data;
  if (replaceEmptyDefault && next.issues.length === 0) {
    next = produce(next, (d) => {
      d.projects = d.projects.filter((p) => p.items.length > 0 || p.title !== 'Default');
    });
  }
  const usedTitles = new Set(next.projects.map((p) => p.title));

  for (const [name, board] of Object.entries(kanbans)) {
    let title = name.trim() || 'Kanban';
    for (let n = 2; usedTitles.has(title); n++) title = `${name.trim() || 'Kanban'} (${n})`;
    usedTitles.add(title);

    const statusOf = new Map<string, string>();
    const statuses: ProjectStatus[] = board.columns.map((col) => {
      const id = genId(false) as string;
      statusOf.set(String(col.id), id);
      return { id, name: col.title?.trim() || 'Untitled', ...(col.hdColor ? { color: col.hdColor } : {}) };
    });
    if (statuses.length === 0) statuses.push({ id: genId(false) as string, name: 'Todo' });

    const projectId = genId(false) as string;
    next = produce(next, (d) => {
      d.projects.push({ id: projectId, title, statuses, items: [], layout: 'board' });
    });

    for (const card of board.cards) {
      const { title: issueTitle, body } = splitContent(card.content);
      const items = card.items ?? [];
      const attachments = items
        .filter((it) => !isNoteItem(it) && it.uri)
        .map((it) => `- [${it.name || it.uri}](${encodeURI(it.uri)})`);
      next = createIssue(next, {
        title: issueTitle,
        body: [body, attachments.length ? `Attachments:\n\n${attachments.join('\n')}` : '']
          .filter(Boolean).join('\n\n'),
        notes: items.filter((it) => isNoteItem(it) && it.uri).map((it) => it.uri),
        project: { id: projectId, status: statusOf.get(String(card.columnId)) ?? statuses[0].id },
      });
    }
  }
  return next;
}
