import { describe, expect, test, vi } from 'vitest';
import { createRef } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import CodeMirror, { type ReactCodeMirrorRef } from './ReactCodeMirror';
import Markdown from './Markdown';
import { oneDark, oneDarkTheme, oneDarkHighlightStyle } from './darkTheme';

const content = (container: HTMLElement) =>
  container.querySelector('.cm-content')?.textContent;

describe('ReactCodeMirror', () => {
  test('mounts an editor with the value and theme class', async () => {
    const ref = createRef<ReactCodeMirrorRef>();
    const { container } = render(<CodeMirror ref={ref} value="hello" className="extra" theme="dark" />);
    await waitFor(() => expect(ref.current?.view).toBeInstanceOf(EditorView));
    expect(container.firstChild).toHaveClass('cm-theme-dark', 'extra');
    expect(content(container)).toBe('hello');
    expect(ref.current?.editor).toBe(container.firstChild);
  });

  test('reports document changes', async () => {
    const ref = createRef<ReactCodeMirrorRef>();
    const onChange = vi.fn();
    const onUpdate = vi.fn();
    render(<CodeMirror ref={ref} value="abc" onChange={onChange} onUpdate={onUpdate} />);
    await waitFor(() => expect(ref.current?.view).toBeDefined());
    act(() => ref.current?.view?.dispatch({ changes: { from: 3, insert: 'd' } }));
    expect(onChange).toHaveBeenCalledWith('abcd', expect.anything());
    expect(onUpdate).toHaveBeenCalled();
  });

  test('syncs external value changes', async () => {
    const ref = createRef<ReactCodeMirrorRef>();
    const { container, rerender } = render(<CodeMirror ref={ref} value="one" />);
    await waitFor(() => expect(ref.current?.view).toBeDefined());
    rerender(<CodeMirror ref={ref} value="two" />);
    await waitFor(() => expect(content(container)).toBe('two'));
  });

  test('respects editable and readOnly', async () => {
    const ref = createRef<ReactCodeMirrorRef>();
    render(<CodeMirror ref={ref} value="x" editable={false} readOnly placeholder="ph" theme={oneDark} />);
    await waitFor(() => expect(ref.current?.view).toBeDefined());
    expect(ref.current?.view?.state.readOnly).toBe(true);
    expect(ref.current?.view?.contentDOM).toHaveAttribute('contenteditable', 'false');
  });

  test('throws for non-string values', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<CodeMirror value={1 as unknown as string} />)).toThrow(/typeof string/);
    vi.restoreAllMocks();
  });

  test('destroys the view on unmount', async () => {
    const ref = createRef<ReactCodeMirrorRef>();
    const { unmount } = render(<CodeMirror ref={ref} value="x" />);
    await waitFor(() => expect(ref.current?.view).toBeDefined());
    const view = ref.current?.view as EditorView;
    const destroy = vi.spyOn(view, 'destroy');
    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});

describe('Markdown', () => {
  test('renders markdown content and forwards changes', async () => {
    const onChange = vi.fn();
    const { container } = render(<Markdown initialContent="# Title" onChange={onChange} dark={false} />);
    await waitFor(() => expect(content(container)).toBe('# Title'));
    expect(container.firstChild).toHaveClass('cm-theme-light');
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement);
    act(() => view?.dispatch({ changes: { from: 7, insert: '!' } }));
    expect(onChange).toHaveBeenCalledWith('# Title!');
  });

  test('supports json, dark mode and read mode', async () => {
    const { container } = render(
      <Markdown lang="json" initialContent='{"a":1}' onChange={vi.fn()} dark readMode />
    );
    await waitFor(() => expect(content(container)).toBe('{"a":1}'));
    expect(container.firstChild).toHaveClass('cm-theme-dark');
    expect(container.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
  });
});

describe('darkTheme', () => {
  test('exports a theme extension', () => {
    expect(oneDarkTheme).toBeDefined();
    expect(oneDarkHighlightStyle).toBeDefined();
    expect(Array.isArray(oneDark)).toBe(true);
  });
});
