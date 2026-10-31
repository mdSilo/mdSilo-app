/**
 * The input of the site: what the app gathers from the workspace. Paths are
 * relative to the workspace, with `/`; dates are ISO strings.
 */

export type SiteNote = {
  /** e.g. `writing/Ideas/Foo.md` */
  path: string;
  title: string;
  content: string;
  created: string;
  updated: string;
};

export type SiteBook = {
  /** the id of the book, its hash */
  id: string;
  title: string;
  author?: string;
  /** the note of its annotations, e.g. `reading/Foo.epub.md` */
  annotations?: string;
};

export type SiteLabel = { name: string; color: string };

export type SiteMilestone = {
  id: string;
  title: string;
  description?: string;
  /** yyyy-mm-dd */
  dueOn?: string;
  state: 'open' | 'closed';
};

export type SiteTimelineItem =
  | { kind: 'comment'; body: string; createdAt: string }
  /** e.g. closed, labeled (detail: the label), as the app words them */
  | { kind: 'event'; event: string; detail?: string; createdAt: string };

export type SiteIssue = {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  closedAt?: string;
  labels: SiteLabel[];
  /** the id of its milestone */
  milestone?: string;
  /** yyyy-mm-dd */
  dueOn?: string;
  subtasks: { text: string; done: boolean }[];
  /** the notes linked to it, by path */
  notes: string[];
  /** the task in a note it comes from */
  task?: { note: string; text: string };
  timeline: SiteTimelineItem[];
  createdAt: string;
  updatedAt: string;
};

export type SiteProject = {
  id: string;
  title: string;
  description?: string;
  statuses: { id: string; name: string; color?: string }[];
  items: { issue: number; status: string; order: number }[];
};

/** What to publish: kept in `.mdsilo/publish.json` by the app. */
export type PublishOptions = {
  title: string;
  /** the folders whose notes are published, e.g. `writing/Blog` */
  folders: string[];
  backlinks: boolean;
  graph: boolean;
  tags: boolean;
  /** the books with annotations, their annotations as pages */
  books: boolean;
  issues: boolean;
  /** only the issues with one of these labels; empty: all */
  issueLabels: string[];
  journals: boolean;
  /** math as MathML: `$...$`, `$$...$$`, `\(...\)` */
  math: boolean;
  /** mermaid, echarts and smiles code blocks as pictures (SVG) */
  mermaid: boolean;
  echarts: boolean;
  /** chemical structures: molecules and reactions */
  smiles: boolean;
};

export const DEFAULT_OPTIONS: PublishOptions = {
  title: 'Notes',
  folders: [],
  backlinks: true,
  graph: true,
  tags: false,
  books: false,
  issues: false,
  issueLabels: [],
  journals: false,
  math: true,
  mermaid: true,
  echarts: true,
  smiles: true,
};

export type SiteInput = {
  notes: SiteNote[];
  books: SiteBook[];
  issues: SiteIssue[];
  milestones: SiteMilestone[];
  projects: SiteProject[];
  options: PublishOptions;
};

/**
 * Pictures of code blocks, drawn where a browser is (the app): SVG. Without
 * one, or if it fails, the code shows.
 */
export type Renderers = {
  mermaid?: (code: string) => Promise<string>;
  echarts?: (code: string) => Promise<string>;
  smiles?: (code: string) => Promise<string>;
};

/** A file of the site: its text, or a file of the workspace to copy. */
export type SiteFile = { path: string; text: string } | { path: string; copy: string };
