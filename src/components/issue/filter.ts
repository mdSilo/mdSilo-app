import { commentCount } from './issueOps';
import type { Issue, IssueData, IssueState } from './types';

export type SortKey = 'created' | 'updated' | 'comments' | 'number' | 'title';
export type SortDir = 'asc' | 'desc';

export type IssueQuery = {
  state?: IssueState;
  labels: string[]; // label names, all required
  excludeLabels: string[];
  milestone?: string; // milestone title
  noLabel: boolean;
  noMilestone: boolean;
  sort: { key: SortKey; dir: SortDir };
  text: string; // free text, matched against title and body
};

export const DEFAULT_SORT = { key: 'created', dir: 'desc' } as const;
export const SORT_KEYS: SortKey[] = ['created', 'updated', 'comments', 'number', 'title'];

/** Split on whitespace, keeping "quoted values" (also in key:"quoted value") together. */
export function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const re = /(-?[\w]+:"[^"]*"?|"[^"]*"?|\S+)/g;
  for (const m of query.matchAll(re)) {
    tokens.push(m[0]);
  }
  return tokens;
}

const unquote = (s: string) => s.replace(/^"/, '').replace(/"$/, '');

/**
 * Parse a GitHub-style query, e.g.
 * `is:open label:bug milestone:"v1" no:milestone sort:updated-desc fix crash`
 */
export function parseQuery(query: string): IssueQuery {
  const q: IssueQuery = {
    labels: [],
    excludeLabels: [],
    noLabel: false,
    noMilestone: false,
    sort: { ...DEFAULT_SORT },
    text: '',
  };
  const words: string[] = [];
  for (const token of tokenize(query)) {
    const m = token.match(/^(-?)(\w+):(.*)$/);
    if (!m) {
      words.push(unquote(token));
      continue;
    }
    const [, neg, rawKey, rawVal] = m;
    const key = rawKey.toLowerCase();
    const val = unquote(rawVal);
    if (key === 'is' || key === 'state') {
      if (val === 'open' || val === 'closed') q.state = val;
      // is:issue and others are accepted and ignored
    } else if (key === 'label') {
      (neg ? q.excludeLabels : q.labels).push(val);
    } else if (key === 'milestone') {
      q.milestone = val;
    } else if (key === 'no') {
      if (val === 'label') q.noLabel = true;
      if (val === 'milestone') q.noMilestone = true;
    } else if (key === 'sort') {
      const [k, d] = val.split('-');
      if ((SORT_KEYS as string[]).includes(k)) {
        q.sort = { key: k as SortKey, dir: d === 'asc' ? 'asc' : 'desc' };
      }
    } else {
      words.push(token); // unknown qualifier: treat as text
    }
  }
  q.text = words.join(' ').trim();
  return q;
}

/** Turn a query back into a string (used to toggle qualifiers from the UI). */
export function stringifyQuery(q: IssueQuery): string {
  const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
  const parts: string[] = [];
  if (q.state) parts.push(`is:${q.state}`);
  q.labels.forEach((l) => parts.push(`label:${quote(l)}`));
  q.excludeLabels.forEach((l) => parts.push(`-label:${quote(l)}`));
  if (q.milestone) parts.push(`milestone:${quote(q.milestone)}`);
  if (q.noLabel) parts.push('no:label');
  if (q.noMilestone) parts.push('no:milestone');
  if (q.sort.key !== DEFAULT_SORT.key || q.sort.dir !== DEFAULT_SORT.dir) {
    parts.push(`sort:${q.sort.key}-${q.sort.dir}`);
  }
  if (q.text) parts.push(q.text);
  return parts.join(' ');
}

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

export function sortIssues(issues: Issue[], sort: IssueQuery['sort']) {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const keyOf = (i: Issue): string | number => {
    switch (sort.key) {
      case 'updated': return i.updatedAt;
      case 'comments': return commentCount(i);
      case 'number': return i.number;
      case 'title': return i.title.toLowerCase();
      default: return i.createdAt;
    }
  };
  return [...issues].sort((a, b) => sign * cmp(keyOf(a), keyOf(b)) || sign * (a.number - b.number));
}

/**
 * Filter (and sort) issues with a query string or a parsed query.
 * `ignoreState` drops the is:open/closed qualifier, e.g. to count both tabs.
 */
export function filterIssues(
  data: Pick<IssueData, 'issues' | 'labels' | 'milestones'>,
  query: string | IssueQuery,
  ignoreState = false
): Issue[] {
  const q = typeof query === 'string' ? parseQuery(query) : query;
  const ci = (s: string) => s.toLowerCase();
  const labelName = new Map(data.labels.map((l) => [l.id, ci(l.name)]));
  const milestone = q.milestone && data.milestones.find((m) => ci(m.title) === ci(q.milestone ?? ''));
  const words = ci(q.text).split(/\s+/).filter(Boolean);

  const result = data.issues.filter((issue) => {
    if (!ignoreState && q.state && issue.state !== q.state) return false;
    const names = issue.labels.map((id) => labelName.get(id)).filter(Boolean) as string[];
    if (q.labels.some((l) => !names.includes(ci(l)))) return false;
    if (q.excludeLabels.some((l) => names.includes(ci(l)))) return false;
    if (q.noLabel && names.length > 0) return false;
    if (q.noMilestone && issue.milestone) return false;
    if (q.milestone && (!milestone || issue.milestone !== milestone.id)) return false;
    if (words.length > 0) {
      const hay = ci(`#${issue.number} ${issue.title} ${issue.body}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  return sortIssues(result, q.sort);
}
