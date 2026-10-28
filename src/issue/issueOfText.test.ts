import { afterEach, describe, expect, test } from 'vitest';
import { store } from '@/state/store';
import { useWebFs } from '@/testUtils';
import { issueOfNoteText } from './issueOfText';
import { issueStore, resetIssueStore } from './issueStore';

describe('issueOfNoteText', () => {
  afterEach(() => resetIssueStore());

  test('the text quoted, linked back to the note, the note linked', async () => {
    await useWebFs();
    store.getState().setInitDir('/ws');
    const link = await issueOfNoteText('fix the\n  build  ', '/ws/writing/Plan.md', 'Plan');
    expect(link).toEqual({ title: '@1', href: 'issue:1' });
    const issue = issueStore.getState().data.issues[0];
    expect(issue).toMatchObject({
      title: 'fix the build',
      body: '> fix the\n> build\n>\n> — [[Plan]]',
      notes: ['/ws/writing/Plan.md'],
    });
    // a title not fit for [[ ]]
    await issueOfNoteText('x', '/ws/a.md', 'a [b]');
    expect(issueStore.getState().data.issues[1].body).toBe('> x\n>\n> — [a b](a%20%5Bb%5D)');
    expect(await issueOfNoteText('  ', '/ws/a.md', 'a')).toBeUndefined();
  });
});
