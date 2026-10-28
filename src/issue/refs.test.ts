import { describe, expect, test } from 'vitest';
import { NoteMap } from '@/lib/noteMap';
import { makeNote } from '@/testUtils';
import * as ops from './issueOps';
import {
  computeIssueRefs, computeNoteMentions, issueHref, issueLabel, linkedIssueNumbers, linkedNoteTitles, parseIssueHref,
  parseIssueLabel,
} from './refs';

describe('refs', () => {
  test('issue hrefs', () => {
    expect(issueHref(12)).toBe('issue:12');
    expect(parseIssueHref(' issue:12 ')).toBe(12);
    expect(parseIssueHref('issue:x')).toBeUndefined();
    expect(parseIssueHref('issue:0')).toBeUndefined();
    expect(parseIssueHref('Note')).toBeUndefined();
  });

  test('issues shown as @12, #12 read too', () => {
    expect(issueLabel(12)).toBe('@12');
    expect(parseIssueLabel(' @12 ')).toBe(12);
    expect(parseIssueLabel('#3')).toBe(3);
    expect(parseIssueLabel('@x')).toBeUndefined();
  });

  test('linked titles and issue numbers', () => {
    const text = '[[A]] [[B|b]] [c](C%20D) [u](https://x.io) [#3](issue:3) [#4](issue:4)';
    expect([...linkedNoteTitles(text)]).toEqual(['A', 'B', 'C D']);
    expect([...linkedIssueNumbers(text)]).toEqual([3, 4]);
    expect([...linkedNoteTitles('[x](%E0%A4%A)')]).toEqual(['%E0%A4%A']);
    // links to books are not to notes
    expect([...linkedNoteTitles(`[d](book:${'a'.repeat(32)}#epubcfi(%2F6)) [e](book:Emma) [[N]]`)]).toEqual(['N']);
  });

  test('computeIssueRefs finds explicit links and mentions', () => {
    let d = ops.createIssue(ops.defaultIssueData(), { title: 'a', notes: ['/n/Note.md'] });
    d = ops.createIssue(d, { title: 'b', body: 'see [[Note]]' });
    d = ops.createIssue(d, { title: 'c' });
    d = ops.addComment(d, 3, '[x](Note)');
    d = ops.createIssue(d, { title: 'd', body: '[[Other]]' });
    const refs = computeIssueRefs(d.issues, '/n/Note.md', 'Note');
    expect(refs.map((r) => [r.issue.number, r.explicit, r.mentioned])).toEqual([
      [1, true, false], [2, false, true], [3, false, true],
    ]);
    expect(computeIssueRefs(d.issues, '', '')).toEqual([]);
  });

  test('computeNoteMentions scans note content', () => {
    const notes = NoteMap.from({
      a: makeNote({ id: 'a', title: 'A', content: 'fixes [#1](issue:1)' }),
      b: makeNote({ id: 'b', title: 'B', content: 'see issue:1 text' }),
      c: makeNote({ id: 'c', title: 'C', content: '[#1](issue:1)', is_dir: true }),
    });
    expect(computeNoteMentions(notes, 1)).toEqual([{ id: 'a', title: 'A' }]);
    expect(computeNoteMentions(notes, 2)).toEqual([]);
  });
});
