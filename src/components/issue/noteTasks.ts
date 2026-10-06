import { getJSONContent, parser } from 'mdsmirror';
import type { Notes } from 'lib/store';
import { checkFileIsMd } from 'file/process';
import { createIssue, setState } from './issueOps';
import type { Issue, IssueData, ProjectStatus } from './types';

/*
 * Tasks written in notes with the hashtags #todo#, #doing# or #done#
 * (this replaced the old Task view). They are read live from the notes;
 * a task can be turned into an issue linked to its note.
 */

export const TASK_TAGS = ['todo', 'doing', 'done'] as const;
export type TaskTag = typeof TASK_TAGS[number];

export type NoteTask = {
  id: string; // `${noteId}::${index}`
  noteId: string;
  noteTitle: string;
  tag: TaskTag;
  /** text of the block holding the tag, without the tag */
  text: string;
  updatedAt: string;
};

type JsonNode = {
  type?: string;
  text?: string;
  marks?: { type: string }[];
  content?: JsonNode[];
};

const tagOf = (node: JsonNode): TaskTag | undefined => {
  if (!node.text || !node.marks?.some((m) => m.type === 'hashtag')) return undefined;
  const t = node.text.trim().replace(/^#|#$/g, '').toLowerCase();
  return (TASK_TAGS as readonly string[]).includes(t) ? (t as TaskTag) : undefined;
};

/** Tasks of one markdown text: blocks whose inline content has a task tag. */
export function extractTasks(content: string): { tag: TaskTag; text: string }[] {
  if (!content || !/#(todo|doing|done)#/i.test(content)) return [];
  const out: { tag: TaskTag; text: string }[] = [];
  const walk = (node: JsonNode) => {
    const inline = node.content ?? [];
    // a block with text children: one task per block, the first tag wins
    const tag = inline.map(tagOf).find(Boolean);
    if (tag) {
      const text = inline
        .filter((n) => !tagOf(n))
        .map((n) => n.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      out.push({ tag, text });
    }
    for (const child of inline) {
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
        tag: t.tag,
        text: t.text,
        updatedAt: n.updated_at,
      }))
    );
}

/** The issue created from a task, if any. */
export const issueOfTask = (issues: Issue[], task: NoteTask) =>
  issues.find((i) => i.noteTask?.note === task.noteId && i.noteTask.text === task.text);

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

/**
 * Create an issue from a note task: linked to the note, on the first
 * project's matching column, closed if the task is #done#.
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
    noteTask: { note: task.noteId, text: task.text },
    ...(project && status ? { project: { id: project.id, status: status.id } } : {}),
  });
  if (task.tag === 'done') next = setState(next, num, 'closed');
  return next;
}
