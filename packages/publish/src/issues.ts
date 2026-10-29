/**
 * The pages of the issues, as the app shows them, to read: an issue with its
 * labels, milestone, due date, projects, subtasks, notes and timeline; the
 * list with its filters; the milestones; the boards of the projects.
 */
import { escapeHtml, relHref } from './paths';
import type { SiteIssue, SiteLabel, SiteMilestone, SiteProject, SiteTimelineItem } from './types';

export const ISSUES_INDEX = 'issues/index.html';
export const MILESTONES_INDEX = 'issues/milestones.html';
export const PROJECTS_INDEX = 'issues/projects.html';

/** A timeline item, its comment rendered. */
export type TimelineEntry = Exclude<SiteTimelineItem, { kind: 'comment' }> | { kind: 'comment'; html: string; createdAt: string };

export type IssueContext = {
  issues: SiteIssue[];
  milestones: Map<string, SiteMilestone>;
  projects: SiteProject[];
  /** the page of an issue */
  issuePath: (num: number) => string | undefined;
  /** the page of a project */
  projectPath: (id: string) => string;
  /** a note, by path: its page if published, its title */
  note: (path: string) => { title: string; path?: string };
};

const dateOf = (iso: string) => iso.slice(0, 10);

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A label in its color, the text dark or light to read on it. */
export function labelChip(label: SiteLabel, href?: string) {
  const color = HEX.test(label.color) ? label.color : '#8b949e';
  const full = color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
  const text = r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#1f2328' : '#ffffff';
  const style = `style="background:${full};color:${text}"`;
  const name = escapeHtml(label.name);
  return href ? `<a class="label" ${style} href="${href}">${name}</a>` : `<span class="label" ${style}>${name}</span>`;
}

export const stateBadge = (state: SiteIssue['state']) => `<span class="state ${state}">${state === 'open' ? 'Open' : 'Closed'}</span>`;

/** The due date; marked overdue in the browser, as of the day read. */
const dueOf = (issue: SiteIssue) =>
  issue.dueOn ? `<span class="due" data-due="${escapeHtml(issue.dueOn)}" data-state="${issue.state}">due ${escapeHtml(issue.dueOn)}</span>` : '';

/** The events as the app words them, see src/issue/Timeline.tsx. */
export function eventText(event: string, detail = '') {
  const d = escapeHtml(detail);
  switch (event) {
    case 'opened': return 'opened this issue';
    case 'closed': return 'closed this issue';
    case 'reopened': return 'reopened this issue';
    case 'labeled': return `added the <b>${d}</b> label`;
    case 'unlabeled': return `removed the <b>${d}</b> label`;
    case 'milestoned': return `added this to the <b>${d}</b> milestone`;
    case 'demilestoned': return `removed this from the <b>${d}</b> milestone`;
    case 'renamed': return `changed the title ${d}`;
    case 'status': return `moved this to <b>${d}</b>`;
    case 'task': return `synced with its note task: ${d}`;
    case 'due': return d ? `set the due date to ${d}` : 'removed the due date';
    default: return escapeHtml(event);
  }
}

const progressBar = (done: number, total: number) =>
  `<span class="progress" title="${done} of ${total}"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></span>`;

/** The page of an issue, after its title: all but the backlinks. */
export function issueBody(from: string, issue: SiteIssue, body: string, timeline: TimelineEntry[], ctx: IssueContext) {
  const href = (to: string) => relHref(from, to);
  const milestone = issue.milestone ? ctx.milestones.get(issue.milestone) : undefined;
  const side: string[] = [];
  if (issue.labels.length) {
    side.push(`<div><h3>Labels</h3>${issue.labels.map((l) => labelChip(l, `${href(ISSUES_INDEX)}?label=${encodeURIComponent(l.name)}`)).join(' ')}</div>`);
  }
  if (milestone) {
    side.push(`<div><h3>Milestone</h3><a href="${href(MILESTONES_INDEX)}#${milestoneAnchor(milestone)}">${escapeHtml(milestone.title)}</a></div>`);
  }
  if (issue.dueOn) side.push(`<div><h3>Due</h3>${dueOf(issue)}</div>`);
  const inProjects = ctx.projects.flatMap((p) => {
    const item = p.items.find((i) => i.issue === issue.number);
    const status = item && p.statuses.find((s) => s.id === item.status);
    return item ? [`<a href="${href(ctx.projectPath(p.id))}">${escapeHtml(p.title)}</a>${status ? ` · ${escapeHtml(status.name)}` : ''}`] : [];
  });
  if (inProjects.length) side.push(`<div><h3>Projects</h3>${inProjects.join('<br>')}</div>`);
  const notes = issue.notes.map((path) => {
    const note = ctx.note(path);
    return note.path ? `<a href="${href(note.path)}">${escapeHtml(note.title)}</a>` : escapeHtml(note.title);
  });
  if (notes.length) side.push(`<div><h3>Notes</h3>${notes.join('<br>')}</div>`);
  if (issue.task) {
    const note = ctx.note(issue.task.note);
    const where = note.path ? `<a href="${href(note.path)}">${escapeHtml(note.title)}</a>` : escapeHtml(note.title);
    side.push(`<div><h3>Task</h3>${escapeHtml(issue.task.text)} · in ${where}</div>`);
  }

  const done = issue.subtasks.filter((s) => s.done).length;
  const subtasks = issue.subtasks.length
    ? `<section class="subtasks"><h2>Subtasks <span class="num">${done}/${issue.subtasks.length}</span> ${progressBar(done, issue.subtasks.length)}</h2><ul>${issue.subtasks
        .map((s) => `<li class="${s.done ? 'done' : ''}"><span class="box">${s.done ? '☑' : '☐'}</span> ${escapeHtml(s.text)}</li>`)
        .join('')}</ul></section>`
    : '';
  const items = timeline
    .map((item) =>
      item.kind === 'comment'
        ? `<div class="comment"><p class="meta">commented on ${escapeHtml(dateOf(item.createdAt))}</p>${item.html}</div>`
        : `<p class="event"><span class="dot"></span>${eventText(item.event, item.detail)} <span class="meta">${escapeHtml(dateOf(item.createdAt))}</span></p>`
    )
    .join('');
  const opened = `<p class="meta">${stateBadge(issue.state)} opened ${escapeHtml(dateOf(issue.createdAt))}${
    issue.closedAt && issue.state === 'closed' ? ` · closed ${escapeHtml(dateOf(issue.closedAt))}` : ''
  }</p>`;
  return `${opened}<div class="issue"><div class="issue-main"><div class="issue-body">${body || '<p class="meta">No description.</p>'}</div>${subtasks}<section class="timeline">${items}</section></div>${
    side.length ? `<aside class="issue-side">${side.join('')}</aside>` : ''
  }</div><script src="${href('assets/issues.js')}"></script>`;
}

const milestoneAnchor = (m: SiteMilestone) => `m-${m.id.replace(/[^\w-]/g, '')}`;

function issueRow(from: string, issue: SiteIssue, ctx: IssueContext) {
  const path = ctx.issuePath(issue.number);
  const milestone = issue.milestone ? ctx.milestones.get(issue.milestone) : undefined;
  const done = issue.subtasks.filter((s) => s.done).length;
  const comments = issue.timeline.filter((t) => t.kind === 'comment').length;
  const data = [
    `data-state="${issue.state}"`,
    `data-labels="${escapeHtml(issue.labels.map((l) => l.name).join('\n'))}"`,
    `data-milestone="${escapeHtml(milestone?.title ?? '')}"`,
  ].join(' ');
  const title = path ? `<a href="${relHref(from, path)}">${escapeHtml(issue.title)}</a>` : escapeHtml(issue.title);
  const labels = issue.labels.map((l) => labelChip(l)).join(' ');
  const meta = [
    `@${issue.number}`,
    milestone ? `⚑ ${escapeHtml(milestone.title)}` : '',
    dueOf(issue),
    issue.subtasks.length ? `${done}/${issue.subtasks.length} subtasks` : '',
    comments ? `${comments} comment${comments > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return `<li class="issue-row" ${data}>${stateBadge(issue.state)} ${title} ${labels}<span class="meta">${meta.join(' · ')}</span></li>`;
}

/** The list: open first, filters by state, label, milestone (in the browser). */
export function issuesIndex(ctx: IssueContext) {
  const from = ISSUES_INDEX;
  const sorted = [...ctx.issues].sort((a, b) => (a.state === b.state ? b.number - a.number : a.state === 'open' ? -1 : 1));
  const open = ctx.issues.filter((i) => i.state === 'open').length;
  const labels = [...new Set(ctx.issues.flatMap((i) => i.labels.map((l) => l.name)))].sort();
  const milestones = [...new Set(ctx.issues.map((i) => (i.milestone ? ctx.milestones.get(i.milestone)?.title : undefined)).filter((t): t is string => !!t))].sort();
  const options = (name: string, all: string, values: string[]) =>
    `<select name="${name}" aria-label="${all}"><option value="">${all}</option>${values.map((v) => `<option>${escapeHtml(v)}</option>`).join('')}</select>`;
  const links = [
    ctx.milestones.size ? `<a href="${relHref(from, MILESTONES_INDEX)}">Milestones</a>` : '',
    ctx.projects.length ? `<a href="${relHref(from, PROJECTS_INDEX)}">Projects</a>` : '',
  ].filter(Boolean);
  const filters = `<form class="filters"><span class="tabs"><button type="button" data-state="open">${open} Open</button><button type="button" data-state="closed">${ctx.issues.length - open} Closed</button><button type="button" data-state="">All</button></span>${
    labels.length ? options('label', 'All labels', labels) : ''
  }${milestones.length ? options('milestone', 'All milestones', milestones) : ''}</form>`;
  return `<h1>Issues</h1>${links.length ? `<p class="subnav">${links.join(' · ')}</p>` : ''}${filters}<ul class="issues">${sorted
    .map((i) => issueRow(from, i, ctx))
    .join('')}</ul><p class="empty meta" hidden>No issues match.</p><script src="${relHref(from, 'assets/issues.js')}"></script>`;
}

/** The milestones: due date, progress, their issues. */
export function milestonesPage(ctx: IssueContext) {
  const from = MILESTONES_INDEX;
  const sections = [...ctx.milestones.values()]
    .map((m) => {
      const issues = ctx.issues.filter((i) => i.milestone === m.id);
      if (!issues.length) return '';
      const closed = issues.filter((i) => i.state === 'closed').length;
      const due = m.dueOn ? ` · due ${escapeHtml(m.dueOn)}` : '';
      const description = m.description ? `<p>${escapeHtml(m.description)}</p>` : '';
      return `<section class="milestone" id="${milestoneAnchor(m)}"><h2>${escapeHtml(m.title)} ${stateBadge(m.state)}</h2><p class="meta">${closed}/${issues.length} closed${due} ${progressBar(closed, issues.length)}</p>${description}<ul class="issues">${issues
        .map((i) => issueRow(from, i, ctx))
        .join('')}</ul></section>`;
    })
    .join('');
  return `<h1>Milestones</h1><p class="subnav"><a href="${relHref(from, ISSUES_INDEX)}">Issues</a></p>${sections || '<p class="meta">No milestones.</p>'}<script src="${relHref(from, 'assets/issues.js')}"></script>`;
}

/** The projects, each a link to its board. */
export function projectsIndex(ctx: IssueContext) {
  const from = PROJECTS_INDEX;
  const items = ctx.projects
    .map((p) => `<li><a href="${relHref(from, ctx.projectPath(p.id))}">${escapeHtml(p.title)}</a> <span class="meta">${p.items.length} issues</span>${p.description ? `<br><span class="meta">${escapeHtml(p.description)}</span>` : ''}</li>`)
    .join('');
  return `<h1>Projects</h1><p class="subnav"><a href="${relHref(from, ISSUES_INDEX)}">Issues</a></p><ul class="pages">${items}</ul>`;
}

/** A project as a board: a column per status, its cards in order. */
export function projectBoard(from: string, project: SiteProject, ctx: IssueContext) {
  const byNumber = new Map(ctx.issues.map((i) => [i.number, i]));
  const columns = project.statuses
    .map((status) => {
      const cards = project.items
        .filter((item) => item.status === status.id && byNumber.has(item.issue))
        .sort((a, b) => a.order - b.order)
        .map((item) => {
          const issue = byNumber.get(item.issue) as SiteIssue;
          const path = ctx.issuePath(issue.number);
          const title = path ? `<a href="${relHref(from, path)}">${escapeHtml(issue.title)}</a>` : escapeHtml(issue.title);
          return `<div class="card">${stateBadge(issue.state)} ${title}<div class="meta">@${issue.number} ${issue.labels.map((l) => labelChip(l)).join(' ')}</div></div>`;
        });
      const color = status.color && HEX.test(status.color) ? ` style="border-top-color:${status.color}"` : '';
      return `<div class="column"${color}><h3>${escapeHtml(status.name)} <span class="num">${cards.length}</span></h3>${cards.join('')}</div>`;
    })
    .join('');
  const description = project.description ? `<p>${escapeHtml(project.description)}</p>` : '';
  return `<h1>${escapeHtml(project.title)}</h1><p class="subnav"><a href="${relHref(from, PROJECTS_INDEX)}">Projects</a> · <a href="${relHref(from, ISSUES_INDEX)}">Issues</a></p>${description}<div class="board">${columns}</div>`;
}
