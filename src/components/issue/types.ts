export type IssueState = 'open' | 'closed';

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
  | 'status';

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
