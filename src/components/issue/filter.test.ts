import { describe, expect, test } from 'vitest';
import * as ops from './issueOps';
import { filterIssues, parseQuery, stringifyQuery, tokenize } from './filter';

function sample() {
  let d = ops.createMilestone(ops.defaultIssueData(), { title: 'v 1' });
  const m = d.milestones[0].id;
  const bug = d.labels.find((l) => l.name === 'bug')!.id;
  const idea = d.labels.find((l) => l.name === 'idea')!.id;
  d = ops.createIssue(d, { title: 'Crash on start', body: 'stack trace', labels: [bug], milestone: m });
  d = ops.createIssue(d, { title: 'Dark theme', labels: [idea] });
  d = ops.createIssue(d, { title: 'Fix crash in export', labels: [bug, idea] });
  d = ops.addComment(d, 2, 'c1');
  d = ops.addComment(d, 2, 'c2');
  d = ops.setState(d, 3, 'closed');
  return d;
}
const nums = (issues: { number: number }[]) => issues.map((i) => i.number);

describe('parseQuery', () => {
  test('tokenizes quoted values', () => {
    expect(tokenize('is:open label:"good first" "two words" x')).toEqual([
      'is:open', 'label:"good first"', '"two words"', 'x',
    ]);
  });

  test('parses qualifiers and free text', () => {
    const q = parseQuery('is:closed label:bug -label:wontfix milestone:"v 1" no:label no:milestone sort:updated-asc foo bar:baz');
    expect(q).toEqual({
      state: 'closed', labels: ['bug'], excludeLabels: ['wontfix'], milestone: 'v 1',
      noLabel: true, noMilestone: true, sort: { key: 'updated', dir: 'asc' }, text: 'foo bar:baz',
    });
    expect(parseQuery('is:issue sort:bogus').sort).toEqual({ key: 'created', dir: 'desc' });
    expect(parseQuery('').state).toBeUndefined();
  });

  test('stringify round-trips', () => {
    const s = 'is:open label:bug -label:x milestone:"v 1" no:label no:milestone sort:comments-desc hello';
    expect(stringifyQuery(parseQuery(s))).toBe(s);
    expect(stringifyQuery(parseQuery('sort:created-desc'))).toBe('');
  });
});

describe('filterIssues', () => {
  test('state, labels, milestone and text', () => {
    const d = sample();
    expect(nums(filterIssues(d, ''))).toEqual([3, 2, 1]);
    expect(nums(filterIssues(d, 'is:open'))).toEqual([2, 1]);
    expect(nums(filterIssues(d, 'is:open', true))).toEqual([3, 2, 1]);
    expect(nums(filterIssues(d, 'label:BUG'))).toEqual([3, 1]);
    expect(nums(filterIssues(d, 'label:bug label:idea'))).toEqual([3]);
    expect(nums(filterIssues(d, '-label:bug'))).toEqual([2]);
    expect(nums(filterIssues(d, 'milestone:"v 1"'))).toEqual([1]);
    expect(nums(filterIssues(d, 'milestone:nope'))).toEqual([]);
    expect(nums(filterIssues(d, 'no:milestone'))).toEqual([3, 2]);
    expect(nums(filterIssues(d, 'no:label'))).toEqual([]);
    expect(nums(filterIssues(d, 'crash'))).toEqual([3, 1]);
    expect(nums(filterIssues(d, 'stack'))).toEqual([1]);
    expect(nums(filterIssues(d, '#2'))).toEqual([2]);
  });

  test('sorting', () => {
    const d = sample();
    expect(nums(filterIssues(d, 'sort:created-asc'))).toEqual([1, 2, 3]);
    expect(nums(filterIssues(d, 'sort:comments-desc'))[0]).toBe(2);
    expect(nums(filterIssues(d, 'sort:title-asc'))).toEqual([1, 2, 3]);
    expect(nums(filterIssues(d, 'sort:number-desc'))).toEqual([3, 2, 1]);
    expect(nums(filterIssues(d, 'sort:updated-desc'))).toHaveLength(3);
  });
});
