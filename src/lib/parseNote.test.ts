import { parseNote } from './parseNote';

// the same cases as src-tauri/src/index/parse.rs: both find the same
describe('parseNote', () => {
  test('links to notes', () => {
    const content = '[[A]] and [[B|alias]], [c](C%20d) [img](!x) ![pic](p.png) [w](https://x.org) '
      + '[#1](issue:1) [q](book:0123#x) \\[[not]] [e](<E f>) [[[x]](y)';
    expect(parseNote(content).links).toEqual(['A', 'B', 'C d', '!x', 'E f', 'x']);
  });

  test('not in code', () => {
    const content = '`[[a]]` [[b]]\n```\n[[c]]\n```\n``x [[d]] x`` [[e]]\n~~~\n[[f]]';
    expect(parseNote(content).links).toEqual(['b', 'e']);
  });

  test('tags, issues, tasks', () => {
    const parsed = parseNote('x #one# #two words# #a#b# end\n[i](issue:12) [j](issue:3) [k](issue:12)');
    expect(parsed.tags).toEqual(['one', 'two words']);
    expect(parsed.issues).toEqual([3, 12]);
    expect(parsed.has_tasks).toBe(false);
    expect(parseNote('- [ ] buy milk').has_tasks).toBe(true);
    expect(parseNote('call #TODO# now').has_tasks).toBe(true);
  });
});
