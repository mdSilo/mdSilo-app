export type IssueState = 'open' | 'closed';

export type TaskTag = 'todo' | 'doing' | 'done';
/** tag: #todo# #doing# #done#; checkbox: - [ ] / - [x] */
export type TaskKind = 'tag' | 'checkbox';

/** The note task an issue was created from, kept in sync with the note. */
export type NoteTaskRef = {
  note: string; // note path
  text: string; // task text, identifies the task in the note
  kind?: TaskKind; // default 'tag'
  /** the task's tag at the last sync; only changes made in the note are applied */
  tag?: TaskTag;
  /** the task is no longer in the note (the issue was closed) */
  missing?: boolean;
};

export type Label = {
  id: string;
  name: string;
  color: string;
  description?: string;
};

export type Milestone = {
  id: string;
  title: string;
  description?: string;
  dueOn?: string; // yyyy-mm-dd
  state: IssueState;
};

export type IssueEventKind =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'labeled'
  | 'unlabeled'
  | 'milestoned'
  | 'demilestoned'
  | 'renamed'
  | 'status'
  | 'task'; // synced from the source task in a note

export type CommentItem = {
  id: string;
  kind: 'comment';
  body: string;
  createdAt: string;
  updatedAt?: string;
};

export type EventItem = {
  id: string;
  kind: 'event';
  event: IssueEventKind;
  detail?: string;
  createdAt: string;
};

export type TimelineItem = CommentItem | EventItem;

export type Issue = {
  number: number; // human id, #12 (monotonic, never reused)
  title: string;
  body: string; // markdown, may contain [[note]] links
  state: IssueState;
  closedAt?: string;
  labels: string[]; // Label ids
  milestone?: string; // Milestone id
  notes: string[]; // explicitly linked note paths (note.id === file_path)
  /** set when created from a #todo#/#doing#/#done# task in a note */
  noteTask?: NoteTaskRef;
  timeline: TimelineItem[];
  createdAt: string;
  updatedAt: string;
};

// closes => moving an item here closes the issue
export type ProjectStatus = { id: string; name: string; color?: string; closes?: boolean };

export type ProjectItem = { issue: number; status: string; order: number };

export type ProjectLayout = 'board' | 'table';

export type Project = {
  id: string;
  title: string;
  description?: string;
  statuses: ProjectStatus[]; // board columns
  items: ProjectItem[];
  layout: ProjectLayout;
};

export const ISSUE_DATA_VERSION = 1;

export type IssueData = {
  version: 1;
  nextNumber: number;
  issues: Issue[];
  labels: Label[];
  milestones: Milestone[];
  projects: Project[];
};
