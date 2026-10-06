import produce, { Draft } from 'immer';
import { genId } from 'utils/helper';
import { renameTitleInText } from './refs';
import {
  ISSUE_DATA_VERSION,
  Issue,
  IssueData,
  IssueEventKind,
  IssueState,
  Label,
  Milestone,
  Project,
  ProjectLayout,
  ProjectStatus,
} from './types';

/*
 * Pure mutations on IssueData. Every op returns a new IssueData and leaves
 * the input untouched, so the store can just swap the data and save it.
 * Unknown ids/numbers are no-ops.
 */

export const nowIso = () => new Date().toISOString();
const newId = () => genId(false) as string;

export const DEFAULT_LABELS: Omit<Label, 'id'>[] = [
  { name: 'bug', color: '#d73a4a', description: "Something isn't working" },
  { name: 'enhancement', color: '#a2eeef', description: 'New feature or request' },
  { name: 'question', color: '#d876e3', description: 'Further information is requested' },
  { name: 'idea', color: '#0e8a16', description: 'A thought worth exploring' },
];

export const defaultStatuses = (): ProjectStatus[] => [
  { id: newId(), name: 'Todo', color: '#6b7280' },
  { id: newId(), name: 'In Progress', color: '#f59e0b' },
  { id: newId(), name: 'Done', color: '#10b981', closes: true },
];

export function defaultIssueData(): IssueData {
  return {
    version: ISSUE_DATA_VERSION,
    nextNumber: 1,
    issues: [],
    labels: DEFAULT_LABELS.map((l) => ({ ...l, id: newId() })),
    milestones: [],
    projects: [
      { id: newId(), title: 'Default', statuses: defaultStatuses(), items: [], layout: 'board' },
    ],
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * Turn whatever was read from issues.json into valid IssueData:
 * fills missing fields and migrates older versions.
 */
export function normalizeIssueData(raw: unknown): IssueData {
  if (!raw || typeof raw !== 'object') return defaultIssueData();
  const d = raw as Partial<IssueData> & { version?: number };
  // future migrations go here, keyed by d.version
  const issues = arr<Issue>(d.issues)
    .filter((i) => i && Number.isInteger(i.number))
    .map((i) => ({
      ...i,
      title: i.title ?? '',
      body: i.body ?? '',
      state: (i.state === 'closed' ? 'closed' : 'open') as IssueState,
      labels: arr<string>(i.labels),
      notes: arr<string>(i.notes),
      timeline: arr<Issue['timeline'][number]>(i.timeline),
      createdAt: i.createdAt ?? nowIso(),
      updatedAt: i.updatedAt ?? i.createdAt ?? nowIso(),
    }));
  const maxNumber = issues.reduce((m, i) => Math.max(m, i.number), 0);
  return {
    version: ISSUE_DATA_VERSION,
    nextNumber: Math.max(Number(d.nextNumber) || 1, maxNumber + 1),
    issues,
    labels: arr<Label>(d.labels),
    milestones: arr<Milestone>(d.milestones).map((m) => ({ ...m, state: m.state === 'closed' ? 'closed' : 'open' })),
    projects: arr<Project>(d.projects).map((p) => ({
      ...p,
      statuses: arr<ProjectStatus>(p.statuses),
      items: arr<Project['items'][number]>(p.items),
      layout: p.layout === 'table' ? 'table' : 'board',
    })),
  };
}

// helpers on drafts

const findIssue = (d: Draft<IssueData>, num: number) => d.issues.find((i) => i.number === num);

function pushEvent(issue: Draft<Issue>, event: IssueEventKind, detail?: string, at = nowIso()) {
  issue.timeline.push({ id: newId(), kind: 'event', event, ...(detail !== undefined ? { detail } : {}), createdAt: at });
  issue.updatedAt = at;
}

/** Keep project boards in line with the issue state (like GitHub's built-in workflows). */
function syncProjectsOnState(d: Draft<IssueData>, num: number, state: IssueState) {
  for (const p of d.projects) {
    const item = p.items.find((it) => it.issue === num);
    if (!item) continue;
    const current = p.statuses.find((s) => s.id === item.status);
    const target =
      state === 'closed'
        ? !current?.closes && p.statuses.find((s) => s.closes)
        : current?.closes && p.statuses.find((s) => !s.closes);
    if (target) {
      item.status = target.id;
      item.order = nextOrder(p, target.id);
    }
  }
}

function applyState(d: Draft<IssueData>, issue: Draft<Issue>, state: IssueState, at = nowIso()) {
  if (issue.state === state) return false;
  issue.state = state;
  if (state === 'closed') {
    issue.closedAt = at;
  } else {
    delete issue.closedAt;
  }
  pushEvent(issue, state === 'closed' ? 'closed' : 'reopened', undefined, at);
  return true;
}

const nextOrder = (p: Draft<Project> | Project, status: string) =>
  p.items.filter((it) => it.status === status).reduce((m, it) => Math.max(m, it.order + 1), 0);

// issues

export type NewIssue = {
  title: string;
  body?: string;
  labels?: string[];
  milestone?: string;
  notes?: string[];
  noteTask?: Issue['noteTask'];
  /** add the new issue to this project, in this status (default: first status) */
  project?: { id: string; status?: string };
};

export const createIssue = (data: IssueData, input: NewIssue) =>
  produce(data, (d) => {
    const at = nowIso();
    const issue: Issue = {
      number: d.nextNumber,
      title: input.title.trim() || 'Untitled',
      body: input.body ?? '',
      state: 'open',
      labels: (input.labels ?? []).filter((id) => d.labels.some((l) => l.id === id)),
      ...(input.milestone && d.milestones.some((m) => m.id === input.milestone) ? { milestone: input.milestone } : {}),
      notes: [...new Set(input.notes ?? [])],
      ...(input.noteTask ? { noteTask: input.noteTask } : {}),
      timeline: [{ id: newId(), kind: 'event', event: 'opened', createdAt: at }],
      createdAt: at,
      updatedAt: at,
    };
    d.issues.push(issue);
    d.nextNumber += 1;
    const p = input.project && d.projects.find((pr) => pr.id === input.project?.id);
    const status = p && (p.statuses.find((s) => s.id === input.project?.status) ?? p.statuses[0]);
    if (p && status) {
      p.items.push({ issue: issue.number, status: status.id, order: nextOrder(p, status.id) });
    }
  });

export const updateIssue = (data: IssueData, num: number, patch: { title?: string; body?: string }) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue) return;
    const at = nowIso();
    const title = patch.title?.trim();
    if (title && title !== issue.title) {
      pushEvent(issue, 'renamed', `${issue.title} → ${title}`, at);
      issue.title = title;
    }
    if (patch.body !== undefined && patch.body !== issue.body) {
      issue.body = patch.body;
      issue.updatedAt = at;
    }
  });

export const deleteIssue = (data: IssueData, num: number) =>
  produce(data, (d) => {
    d.issues = d.issues.filter((i) => i.number !== num);
    for (const p of d.projects) {
      p.items = p.items.filter((it) => it.issue !== num);
    }
  });

export const setState = (data: IssueData, num: number, state: IssueState) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (issue && applyState(d, issue, state)) {
      syncProjectsOnState(d, num, state);
    }
  });

export const addLabel = (data: IssueData, num: number, labelId: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    const label = d.labels.find((l) => l.id === labelId);
    if (!issue || !label || issue.labels.includes(labelId)) return;
    issue.labels.push(labelId);
    pushEvent(issue, 'labeled', label.name);
  });

export const removeLabel = (data: IssueData, num: number, labelId: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue || !issue.labels.includes(labelId)) return;
    issue.labels = issue.labels.filter((id) => id !== labelId);
    pushEvent(issue, 'unlabeled', d.labels.find((l) => l.id === labelId)?.name ?? labelId);
  });

export const setMilestone = (data: IssueData, num: number, milestoneId?: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue || issue.milestone === milestoneId) return;
    const titleOf = (id?: string) => d.milestones.find((m) => m.id === id)?.title ?? '';
    if (milestoneId) {
      if (!d.milestones.some((m) => m.id === milestoneId)) return;
      issue.milestone = milestoneId;
      pushEvent(issue, 'milestoned', titleOf(milestoneId));
    } else {
      pushEvent(issue, 'demilestoned', titleOf(issue.milestone));
      delete issue.milestone;
    }
  });

/** Log an event on an issue's timeline. */
export const addEvent = (data: IssueData, num: number, event: IssueEventKind, detail?: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (issue) pushEvent(issue, event, detail);
  });

// comments

export const addComment = (data: IssueData, num: number, body: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue || !body.trim()) return;
    const at = nowIso();
    issue.timeline.push({ id: newId(), kind: 'comment', body, createdAt: at });
    issue.updatedAt = at;
  });

export const editComment = (data: IssueData, num: number, commentId: string, body: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    const item = issue?.timeline.find((t) => t.id === commentId);
    if (!issue || !item || item.kind !== 'comment' || item.body === body) return;
    const at = nowIso();
    item.body = body;
    item.updatedAt = at;
    issue.updatedAt = at;
  });

export const deleteComment = (data: IssueData, num: number, commentId: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue) return;
    issue.timeline = issue.timeline.filter((t) => !(t.id === commentId && t.kind === 'comment'));
  });

// note links

export const linkNote = (data: IssueData, num: number, notePath: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue || !notePath || issue.notes.includes(notePath)) return;
    issue.notes.push(notePath);
    issue.updatedAt = nowIso();
  });

export const unlinkNote = (data: IssueData, num: number, notePath: string) =>
  produce(data, (d) => {
    const issue = findIssue(d, num);
    if (!issue || !issue.notes.includes(notePath)) return;
    issue.notes = issue.notes.filter((p) => p !== notePath);
    issue.updatedAt = nowIso();
  });

/** On note rename: update linked paths and rewrite [[old]] links in bodies and comments. */
export const renameNoteRefs = (
  data: IssueData, oldPath: string, newPath: string, oldTitle: string, newTitle: string
) =>
  produce(data, (d) => {
    for (const issue of d.issues) {
      if (oldPath && issue.notes.includes(oldPath)) {
        issue.notes = [...new Set(issue.notes.map((p) => (p === oldPath ? newPath : p)))];
      }
      if (oldPath && issue.noteTask?.note === oldPath) {
        issue.noteTask.note = newPath;
      }
      issue.body = renameTitleInText(issue.body, oldTitle, newTitle);
      for (const t of issue.timeline) {
        if (t.kind === 'comment') {
          t.body = renameTitleInText(t.body, oldTitle, newTitle);
        }
      }
    }
  });

// labels

export const createLabel = (data: IssueData, label: Omit<Label, 'id'>) =>
  produce(data, (d) => {
    const name = label.name.trim();
    if (!name || d.labels.some((l) => l.name === name)) return;
    d.labels.push({ ...label, name, id: newId() });
  });

export const updateLabel = (data: IssueData, id: string, patch: Partial<Omit<Label, 'id'>>) =>
  produce(data, (d) => {
    const label = d.labels.find((l) => l.id === id);
    if (!label) return;
    const name = patch.name?.trim();
    if (name !== undefined && (!name || d.labels.some((l) => l.id !== id && l.name === name))) return;
    Object.assign(label, patch, name ? { name } : {});
  });

export const deleteLabel = (data: IssueData, id: string) =>
  produce(data, (d) => {
    d.labels = d.labels.filter((l) => l.id !== id);
    for (const issue of d.issues) {
      issue.labels = issue.labels.filter((l) => l !== id);
    }
  });

// milestones

export const createMilestone = (data: IssueData, m: Omit<Milestone, 'id' | 'state'>) =>
  produce(data, (d) => {
    const title = m.title.trim();
    if (!title) return;
    d.milestones.push({ ...m, title, id: newId(), state: 'open' });
  });

export const updateMilestone = (data: IssueData, id: string, patch: Partial<Omit<Milestone, 'id'>>) =>
  produce(data, (d) => {
    const m = d.milestones.find((x) => x.id === id);
    if (!m) return;
    const title = patch.title?.trim();
    if (title !== undefined && !title) return;
    Object.assign(m, patch, title ? { title } : {});
    if (patch.dueOn === '') delete m.dueOn;
  });

export const deleteMilestone = (data: IssueData, id: string) =>
  produce(data, (d) => {
    d.milestones = d.milestones.filter((m) => m.id !== id);
    for (const issue of d.issues) {
      if (issue.milestone === id) delete issue.milestone;
    }
  });

// projects

export const createProject = (data: IssueData, title: string, description?: string) =>
  produce(data, (d) => {
    const t = title.trim();
    if (!t) return;
    d.projects.push({
      id: newId(), title: t, ...(description ? { description } : {}),
      statuses: defaultStatuses(), items: [], layout: 'board',
    });
  });

export const updateProject = (
  data: IssueData, id: string, patch: { title?: string; description?: string; layout?: ProjectLayout }
) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === id);
    if (!p) return;
    const title = patch.title?.trim();
    if (title !== undefined && !title) return;
    Object.assign(p, patch, title ? { title } : {});
  });

export const deleteProject = (data: IssueData, id: string) =>
  produce(data, (d) => {
    d.projects = d.projects.filter((p) => p.id !== id);
  });

export const addStatus = (data: IssueData, projectId: string, name: string) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    const n = name.trim();
    if (!p || !n) return;
    p.statuses.push({ id: newId(), name: n });
  });

export const updateStatus = (
  data: IssueData, projectId: string, statusId: string, patch: Partial<Omit<ProjectStatus, 'id'>>
) =>
  produce(data, (d) => {
    const s = d.projects.find((x) => x.id === projectId)?.statuses.find((x) => x.id === statusId);
    if (!s) return;
    const name = patch.name?.trim();
    if (name !== undefined && !name) return;
    Object.assign(s, patch, name ? { name } : {});
  });

/** Delete a column; its items move to the first remaining column (or leave the project). */
export const deleteStatus = (data: IssueData, projectId: string, statusId: string) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    if (!p) return;
    p.statuses = p.statuses.filter((s) => s.id !== statusId);
    const fallback = p.statuses[0];
    if (!fallback) {
      p.items = [];
      return;
    }
    let order = nextOrder(p, fallback.id);
    for (const it of p.items) {
      if (it.status === statusId) {
        it.status = fallback.id;
        it.order = order++;
      }
    }
  });

/** Move a column to a new index. */
export const moveStatus = (data: IssueData, projectId: string, statusId: string, toIndex: number) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    const from = p?.statuses.findIndex((s) => s.id === statusId) ?? -1;
    if (!p || from < 0) return;
    const [s] = p.statuses.splice(from, 1);
    p.statuses.splice(Math.max(0, Math.min(toIndex, p.statuses.length)), 0, s);
  });

export const addProjectItem = (data: IssueData, projectId: string, num: number, statusId?: string) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    if (!p || !findIssue(d, num) || p.items.some((it) => it.issue === num)) return;
    const status = p.statuses.find((s) => s.id === statusId) ?? p.statuses[0];
    if (!status) return;
    p.items.push({ issue: num, status: status.id, order: nextOrder(p, status.id) });
  });

export const removeProjectItem = (data: IssueData, projectId: string, num: number) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    if (!p) return;
    p.items = p.items.filter((it) => it.issue !== num);
  });

/**
 * Move an issue to `status` at position `order` within that column.
 * Moving into a `closes` column closes the issue; moving a closed issue
 * out of it into a regular column reopens it. Status changes are logged.
 */
export const moveProjectItem = (
  data: IssueData, projectId: string, num: number, statusId: string, order: number
) =>
  produce(data, (d) => {
    const p = d.projects.find((x) => x.id === projectId);
    const issue = findIssue(d, num);
    const status = p?.statuses.find((s) => s.id === statusId);
    if (!p || !issue || !status) return;
    let item = p.items.find((it) => it.issue === num);
    const prevStatus = item?.status;
    if (!item) {
      item = { issue: num, status: status.id, order: 0 };
      p.items.push(item);
    }
    const column = p.items
      .filter((it) => it.status === status.id && it !== item)
      .sort((a, b) => a.order - b.order);
    column.splice(Math.max(0, Math.min(order, column.length)), 0, item);
    item.status = status.id;
    column.forEach((it, idx) => { it.order = idx; });

    if (prevStatus !== status.id) {
      pushEvent(issue, 'status', `${p.title}: ${status.name}`);
      if (status.closes) {
        applyState(d, issue, 'closed');
      } else if (issue.state === 'closed' && p.statuses.find((s) => s.id === prevStatus)?.closes) {
        applyState(d, issue, 'open');
      }
    }
  });

// selectors

export const getIssue = (data: IssueData, num: number) => data.issues.find((i) => i.number === num);

export const commentCount = (issue: Issue) => issue.timeline.filter((t) => t.kind === 'comment').length;

export function milestoneProgress(data: IssueData, milestoneId: string) {
  const issues = data.issues.filter((i) => i.milestone === milestoneId);
  const closed = issues.filter((i) => i.state === 'closed').length;
  const total = issues.length;
  return { open: total - closed, closed, total, percent: total ? Math.round((closed / total) * 100) : 0 };
}

/** Projects containing an issue, with its status in each. */
export const issueProjects = (data: IssueData, num: number) =>
  data.projects.flatMap((p) => {
    const item = p.items.find((it) => it.issue === num);
    return item ? [{ project: p, status: p.statuses.find((s) => s.id === item.status) }] : [];
  });
