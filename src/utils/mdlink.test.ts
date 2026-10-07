import { describe, expect, test } from 'vitest';
import {
  encodeHref,
  findNoteLinks,
  legacyLinkTitle,
  linkTitlesOf,
  maskCode,
  noteTitleMap,
  rawHrefToTitle,
  rewriteNoteLinks,
  safeDecode,
} from './mdlink';

describe('mdlink', () => {
  test('safeDecode does not throw', () => {
    expect(safeDecode('a%20b')).toBe('a b');
    expect(safeDecode('100%')).toBe('100%');
  });

  test('encodeHref round trips titles with parens and spaces', () => {
    const href = encodeHref('a (b) c');
    expect(href).toBe('a%20%28b%29%20c');
    expect(rawHrefToTitle(href)).toBe('a (b) c');
  });

  test('rawHrefToTitle unescapes markdown escapes and angle brackets', () => {
    expect(rawHrefToTitle('\\_draft\\_')).toBe('_draft_');
    expect(rawHrefToTitle('<my note>')).toBe('my note');
  });

  test('maskCode keeps offsets', () => {
    const src = 'a `[[x]]` b\n```\n[[y]]\n```\n[[z]]';
    const masked = maskCode(src);
    expect(masked).toHaveLength(src.length);
    expect(masked).not.toContain('[[x]]');
    expect(masked).not.toContain('[[y]]');
    expect(masked).toContain('[[z]]');
  });

  test('findNoteLinks finds each link once, skipping urls and images', () => {
    const links = findNoteLinks('[[a]] [[b|B]] [c](c%20d) [u](https://x.y) ![i](img.png) [[a]]');
    expect(links.map((l) => l.title)).toEqual(['a', 'b', 'c d', 'a']);
  });

  test('rewriteNoteLinks falls back to md link when the title cannot be in [[]]', () => {
    expect(rewriteNoteLinks('[[a]]', 'a', 'x|y')).toBe('[x|y](x%7Cy)');
    expect(rewriteNoteLinks('[[a|alias]]', 'a', 'x]')).toBe('[alias](x%5D)');
  });

  test('rewriteNoteLinks returns the same string if nothing changed', () => {
    const src = 'no [[link]] to it';
    expect(rewriteNoteLinks(src, 'other', 'x')).toBe(src);
  });
});

describe('legacy links: spaces written as `_` before v0.5.7', () => {
  test('legacyLinkTitle', () => {
    expect(legacyLinkTitle('a b')).toBe('a_b');
    expect(legacyLinkTitle('ab')).toBeUndefined();
  });

  test('linkTitlesOf skips the legacy title if a note has it exactly', () => {
    expect(linkTitlesOf('a b', () => false)).toEqual(['a b', 'a_b']);
    expect(linkTitlesOf('a b', (t) => t === 'a_b')).toEqual(['a b']);
  });

  test('noteTitleMap prefers the exact title', () => {
    expect(noteTitleMap(['a b']).get('a_b')).toBe('a b');
    expect(noteTitleMap(['a b', 'a_b']).get('a_b')).toBe('a_b');
  });

  test('rewriteNoteLinks updates legacy links too', () => {
    expect(rewriteNoteLinks('[x](a_b) [[a_b]] [[a b]]', 'a b', 'c d', ['a b', 'a_b'])).toBe(
      '[x](c%20d) [[c d]] [[c d]]'
    );
  });
});
