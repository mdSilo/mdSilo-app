import { produce } from 'immer';
import { getJSONContent, parser } from 'mdsmirror';
import type { Notes } from 'lib/store';
import { checkFileIsMd } from 'file/process';
import { addEvent, createIssue, moveProjectItem, setState } from './issueOps';
import type { Issue, IssueData, NoteTaskRef, ProjectStatus, TaskKind, TaskTag } from './types';

/*
 * Tasks written in notes (this replaced the old Task view):
 * - hashtag tasks: a block with #todo#, #doing# or #done#
 * - checkbox tasks: `- [ ] text` (todo) and `- [x] text` (done)
 * They are read live from the notes. A task can be turned into an issue
 * linked to its note; the issue then follows the task (syncNoteTasks).
 */

export type { TaskTag, TaskKind } from './types';
export const TASK_TAGS: readonly TaskTag[] = ['todo', 'doing', 'done'];

export type NoteTask = {
  id: string; // `${noteId}::${index}`
  noteId: string;
  noteTitle: string;
  kind: TaskKind;
  tag: TaskTag;
  /** task text without the tag; identifies the task within its note */
  text: string;
  updatedAt: string;
};

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: JsonNode[];
};

const tagOf = (node: JsonNode): TaskTag | undefined => {
  if (!node.text || !node.marks?.some((m) => m.type === 'hashtag')) return undefined;
  const t = node.text.trim().replace(/^#|#$/g, '').toLowerCase();
  return (TASK_TAGS as readonly string[]).includes(t) ? (t as TaskTag) : undefined;
};

const inlineText = (nodes: JsonNode[]) =>
  nodes.filter((n) => !tagOf(n)).map((n) => n.text ?? '').join('').replace(/\s+/g, ' ').trim();

const MAYBE_TASKS = /#(todo|doing|done)#|\[[ xX_-]\]/i;

/** Tasks of one markdown text, in document order. */
export function extractTasks(content: string): { kind: TaskKind; tag: TaskTag; text: string }[] {
  if (!content || !MAYBE_TASKS.test(content)) return [];
  const out: { kind: TaskKind; tag: TaskTag; text: string }[] = [];
  const walk = (node: JsonNode) => {
    const children = node.content ?? [];
    if (node.type === 'checkbox_item') {
      const paragraphs = children.filter((c) => c.type === 'paragraph');
      const inline = paragraphs.flatMap((p) => p.content ?? []);
      // an item that also has a task tag is counted once, as a hashtag task
      if (!inline.some(tagOf)) {
        out.push({ kind: 'checkbox', tag: node.attrs?.checked ? 'done' : 'todo', text: inlineText(inline) });
      }
    } else {
      // a block with text children: one task per block, the first tag wins
      const tag = children.map(tagOf).find(Boolean);
      if (tag) out.push({ kind: 'tag', tag, text: inlineText(children) });
    }
    for (const child of children) {
      if (child.content) walk(child);
    }
  };
  walk(getJSONContent(parser.parse(content)) as JsonNode);
  return out;
}

/** All tasks in the notes, newest notes first. */
export function computeNoteTasks(notes: Notes): NoteTask[] {
  return Object.values(notes)
    .filter((n) => !n.is_dir && checkFileIsMd(n.id))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .flatMap((n) =>
      extractTasks(n.content).map((t, i) => ({
        id: `${n.id}::${i}`,
        noteId: n.id,
        noteTitle: n.title,
        ...t,
        updatedAt: n.updated_at,
      }))
    );
}

const sameTask = (ref: NoteTaskRef, task: Pick<NoteTask, 'noteId' | 'text' | 'kind'>) =>
  ref.note === task.noteId && ref.text === task.text && (ref.kind ?? 'tag') === task.kind;

/** The issue created from a task, if any. */
export const issueOfTask = (issues: Issue[], task: NoteTask) =>
  issues.find((i) => i.noteTask && sameTask(i.noteTask, task));

/** The project column matching a task tag, by name, else by position. */
function statusForTag(statuses: ProjectStatus[], tag: TaskTag) {
  const byName: Record<TaskTag, RegExp> = {
    todo: /^(todo|to do|backlog)$/i,
    doing: /^(doing|in progress|in-progress)$/i,
    done: /^(done|closed)$/i,
  };
  return (
    statuses.find((s) => byName[tag].test(s.name.trim())) ??
    (tag === 'done' ? statuses.find((s) => s.closes) : undefined) ??
    statuses[tag === 'todo' ? 0 : tag === 'doing' ? 1 : statuses.length - 1] ??
    statuses[0]
  );
}

/** Put an issue where a task tag says: state, and column in its project. */
function applyTaskTag(data: IssueData, num: number, tag: TaskTag): IssueData {
  let d = data;
  const project = d.projects.find((p) => p.items.some((it) => it.issue === num));
  if (project) {
    const status = statusForTag(project.statuses, tag);
    const item = project.items.find((it) => it.issue === num);
    if (status && item && item.status !== status.id) {
      const order = project.items.filter((it) => it.status === status.id).length;
      d = moveProjectItem(d, project.id, num, status.id, order);
    }
  }
  return setState(d, num, tag === 'done' ? 'closed' : 'open');
}

const setRef = (data: IssueData, num: number, patch: Partial<NoteTaskRef>) =>
  produce(data, (d) => {
    const ref = d.issues.find((i) => i.number === num)?.noteTask;
    if (!ref) return;
    Object.assign(ref, patch);
    if (patch.missing === false) delete ref.missing;
  });

const label = (kind: TaskKind | undefined, tag: TaskTag | undefined) =>
  !tag ? '?' : (kind ?? 'tag') === 'checkbox' ? (tag === 'done' ? '[x]' : '[ ]') : `#${tag}`;

/**
 * Create an issue from a note task: linked to the note, on the first
 * project's matching column, closed if the task is done.
 * No-op if the task already has an issue.
 */
export function createIssueFromTask(data: IssueData, task: NoteTask): IssueData {
  if (issueOfTask(data.issues, task)) return data;
  const project = data.projects[0];
  const status = project ? statusForTag(project.statuses, task.tag) : undefined;
  const num = data.nextNumber;
  let next = createIssue(data, {
    title: task.text || task.noteTitle,
    body: `From [[${task.noteTitle}]]`,
    notes: [task.noteId],
    noteTask: { note: task.noteId, text: task.text, kind: task.kind, tag: task.tag },
    ...(project && status ? { project: { id: project.id, status: status.id } } : {}),
  });
  if (task.tag === 'done') next = setState(next, num, 'closed');
  return next;
}

/**
 * Keep issues in line with the note tasks they came from:
 * - the task's tag/checkbox changed in the note: move and open/close the issue
 * - the task is gone from its note (or the note is gone): close the issue
 * - a missing task is back: follow it again
 * Only changes made in the note are applied, so an issue closed or moved
 * in the tracker stays so until its task changes. `tasks` must be the
 * tasks of all notes (computeNoteTasks), with the notes fully loaded.
 */
export function syncNoteTasks(data: IssueData, tasks: NoteTask[], notes: Notes): IssueData {
  let d = data;
  for (const issue of data.issues) {
    const ref = issue.noteTask;
    if (!ref) continue;
    const num = issue.number;
    const task = tasks.find((t) => sameTask(ref, t));
    const where = notes[ref.note]?.title ?? ref.note.split(/[\\/]/).pop();
    if (!task) {
      if (ref.missing) continue;
      d = addEvent(d, num, 'task', `the task was removed from ${where}`);
      d = setState(d, num, 'closed');
      d = setRef(d, num, { missing: true });
    } else if (ref.missing) {
      d = addEvent(d, num, 'task', `the task is back in ${where} as ${label(task.kind, task.tag)}`);
      d = applyTaskTag(d, num, task.tag);
      d = setRef(d, num, { missing: false, tag: task.tag });
    } else if (!ref.tag) {
      d = setRef(d, num, { tag: task.tag }); // first sync: remember, change nothing
    } else if (ref.tag !== task.tag) {
      d = addEvent(d, num, 'task', `${label(task.kind, ref.tag)} → ${label(task.kind, task.tag)} in ${where}`);
      d = applyTaskTag(d, num, task.tag);
      d = setRef(d, num, { tag: task.tag });
    }
  }
  return d;
}
