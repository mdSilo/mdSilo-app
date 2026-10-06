import { describe, expect, test, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { store } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import { makeNote, renderWithView } from '../../testUtils';
import IssueEditor from './IssueEditor';

// stand-in editor rendering the anchors ProseMirror would render
vi.mock('mdsmirror', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mdsmirror')>();
  const MockEditor = () => (
    <div className="ProseMirror" tabIndex={0} data-testid="pm">
      <a href="Spec">Spec</a>
      <a href="issue:2">#2</a>
      <a href="#heading">anchor</a>
      <a className="ProseMirror-widget" href="w">widget</a>
      <span className="component-attachment"><a href="file.pdf">file</a></span>
      <a>no href</a>
      <span>plain text</span>
    </div>
  );
  return { ...actual, default: MockEditor };
});
vi.mock('file/open', async (importOriginal) => ({
  ...(await importOriginal<typeof import('file/open')>()),
  openFilePath: vi.fn(async (id: string) => store.getState().notes[id]),
}));

const ViewProbe = () => <p data-testid="view">{JSON.stringify(useCurrentViewContext().state)}</p>;
const view = () => JSON.parse(screen.getByTestId('view').textContent as string);

function setup(readOnly: boolean) {
  const note = makeNote({ id: '/w/Spec.md', title: 'Spec' });
  store.getState().setNotes({ [note.id]: note });
  renderWithView(<><IssueEditor defaultValue="" readOnly={readOnly} /><ViewProbe /></>);
}

/** mousedown then click, like a real click */
function click(el: Element, init: MouseEventInit = {}) {
  fireEvent.mouseDown(el, init);
  return fireEvent.click(el, init);
}

describe('IssueEditor link clicks', () => {
  test('read-only: a click opens issue and note links', async () => {
    setup(true);
    expect(click(screen.getByText('#2'))).toBe(false); // default prevented
    expect(view()).toEqual({ view: 'issue', issueNumber: 2 });
    click(screen.getByText('Spec'));
    await vi.waitFor(() => expect(view()).toEqual({ view: 'md', params: { noteId: '/w/Spec.md' } }));
  });

  test('ignores in-page anchors, widgets, attachments and non-links', () => {
    setup(true);
    for (const name of ['anchor', 'widget', 'file', 'no href', 'plain text']) {
      expect(click(screen.getByText(name))).toBe(true);
    }
    expect(view()).toEqual({ view: 'default' });
  });

  test('editable: opens when not focused or with Ctrl/Cmd, edits when focused', () => {
    setup(false);
    const pm = screen.getByTestId('pm');
    pm.focus();
    expect(click(screen.getByText('#2'))).toBe(true); // focused: cursor goes there
    expect(view()).toEqual({ view: 'default' });
    click(screen.getByText('#2'), { ctrlKey: true });
    expect(view()).toEqual({ view: 'issue', issueNumber: 2 });
    pm.blur();
    click(screen.getByText('#2'), { metaKey: true });
    (document.activeElement as HTMLElement | null)?.blur();
    click(screen.getByText('#2'));
    expect(view()).toEqual({ view: 'issue', issueNumber: 2 });
  });
});
