import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as dialog from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Markmap } from 'markmap-view';
import { store } from 'lib/store';
import { mockInvoke } from '../../testUtils';
import { writeFile } from 'file/write';
import { Mindmap } from './mindmap';

const destroy = vi.hoisted(() => vi.fn());

// markmap measures SVG text, which jsdom cannot do
vi.mock('markmap-view', () => ({
  Markmap: { create: vi.fn(() => ({ destroy })) },
}));
vi.mock('file/write', () => ({ writeFile: vi.fn(async () => undefined) }));

describe('Mindmap', () => {
  test('renders a markmap from markdown', () => {
    render(<Mindmap title="My Map" mdValue={'# Root\n\n## Child'} />);
    expect(Markmap.create).toHaveBeenCalledTimes(1);
    const [svg, options, root] = vi.mocked(Markmap.create).mock.calls[0] as unknown as [
      SVGSVGElement,
      { id: string },
      { content: string; children: { content: string }[] },
    ];
    expect(svg.id).toBe('mindmap');
    expect(options.id).toBe('My Map');
    expect(root.content).toBe('Root');
    expect(root.children[0].content).toBe('Child');
  });

  test('skips empty content', () => {
    render(<Mindmap title="t" mdValue="   " />);
    expect(Markmap.create).not.toHaveBeenCalled();
  });

  test('destroys the markmap on unmount', () => {
    const { unmount } = render(<Mindmap title="t" mdValue="# a" />);
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  test('saves the svg to the chosen path', async () => {
    store.getState().upsertRecentDir('/recent');
    mockInvoke(invoke, { join_paths: ({ root, parts }: Record<string, unknown>) => `${root}/${(parts as string[])[0]}` });
    vi.mocked(dialog.save).mockResolvedValueOnce('C:\\out\\map.svg');
    render(<Mindmap title="My Map" mdValue="# a" initDir="/root" />);
    await userEvent.click(screen.getByText('SAVE RAW SVG'));
    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(dialog.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/recent/My-Map-mindmap.svg' }));
    const [path, svg] = vi.mocked(writeFile).mock.calls[0];
    expect(path).toBe('C:/out/map.svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('background-color:white');
  });

  test('falls back to the mindmap folder when the dialog is cancelled', async () => {
    render(<Mindmap title="" mdValue="# a" initDir="/root" />);
    await userEvent.click(screen.getByText('SAVE RAW SVG'));
    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(vi.mocked(writeFile).mock.calls[0][0]).toBe('/root/mindmap/untitled-mindmap.svg');
  });

  test('does not save without an init dir', async () => {
    render(<Mindmap title="t" mdValue="# a" />);
    await userEvent.click(screen.getByText('SAVE RAW SVG'));
    expect(writeFile).not.toHaveBeenCalled();
  });
});
