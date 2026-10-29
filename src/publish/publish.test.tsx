import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { DEFAULT_OPTIONS, type SiteFile } from 'mdsilo-publish';
import { store } from '@/state/store';
import { issueStore, resetIssueStore } from '@/issue/issueStore';
import { defaultIssueData } from '@/issue/issueOps';
import { makeNote, mockInvoke, resetStore } from '@/testUtils';
import { buildSiteTo, gatherSite, noteFolders, publishSite, readPublishOptions, siteDirOf, usePublishUi } from './publish';
import PublishModal from './PublishModal';
import { siteRenderers } from './renderers';

const WS = '/ws';

const addNote = (path: string, content: string) => {
  const id = `${WS}/${path}`;
  store.getState().upsertNote(makeNote({ id, title: path.split('/').pop()!.replace(/\.md$/, ''), content }));
};

beforeEach(() => {
  resetStore();
  store.getState().setInitDir(WS);
  store.getState().setLayout('workspace');
  addNote('writing/Blog/Hello.md', 'Hello [[Diary]] and [[Post]] @[x](issue:1)');
  addNote('writing/Blog/Deep/Post.md', 'post');
  addNote('writing/Diary.md', 'private');
  addNote('reading/Alice.epub.md', '> a quote');
});
afterEach(() => resetIssueStore());

describe('the site of the workspace', () => {
  test('the options: defaults, as saved', async () => {
    mockInvoke(invoke, { read_file: () => Promise.reject('none') });
    expect(await readPublishOptions(WS)).toEqual(DEFAULT_OPTIONS);
    mockInvoke(invoke, { read_file: '{"folders":["writing/Blog"],"tags":true}' });
    expect(await readPublishOptions(WS)).toEqual({ ...DEFAULT_OPTIONS, folders: ['writing/Blog'], tags: true });
  });

  test('the folders to tick', () => {
    expect(noteFolders(WS)).toEqual(['reading', 'writing', 'writing/Blog', 'writing/Blog/Deep']);
  });

  test('gathered: the notes, the books with annotations, the issues by name', async () => {
    mockInvoke(invoke, {
      read_file: (args: Record<string, unknown>) =>
        String(args.filePath).endsWith('books.json')
          ? JSON.stringify({ version: 1, books: { abc: { file: 'reading/Alice.epub', title: 'Alice', author: 'Carroll' }, def: { file: 'reading/B.pdf', title: 'B' } } })
          : '',
    });
    issueStore.setState({
      data: {
        ...defaultIssueData(),
        labels: [{ id: 'l1', name: 'reading', color: '#000' }],
        milestones: [{ id: 'm1', title: 'Autumn', state: 'open' }],
        issues: [{
          number: 1, title: 'Read', body: 'b', state: 'open', labels: ['l1', 'gone'], milestone: 'm1',
          notes: [`${WS}/writing/Diary.md`], dueOn: '2026-11-01',
          subtasks: [{ id: 's', text: 'one', done: true }],
          noteTask: { note: `${WS}/writing/Diary.md`, text: 'read', tag: 'todo' },
          timeline: [
            { id: 'c', kind: 'comment', body: 'a comment', createdAt: '2026-10-05' },
            { id: 'e', kind: 'event', event: 'closed', detail: 'x', createdAt: '2026-10-06' },
          ],
          createdAt: '2026-10-01', updatedAt: '2026-10-02',
        }],
        projects: [{
          id: 'p', title: 'Board', statuses: [{ id: 's1', name: 'To do', color: '#fff' }],
          items: [{ issue: 1, status: 's1', order: 0 }], layout: 'board',
        }],
      },
      dir: WS, layout: 'workspace', isLoaded: true,
    });
    const site = await gatherSite(WS, { ...DEFAULT_OPTIONS, books: true, issues: true });
    expect(site.notes.map((n) => n.path).sort()).toEqual([
      'reading/Alice.epub.md', 'writing/Blog/Deep/Post.md', 'writing/Blog/Hello.md', 'writing/Diary.md',
    ]);
    expect(site.books).toEqual([
      { id: 'abc', title: 'Alice', author: 'Carroll', annotations: 'reading/Alice.epub.md' },
      { id: 'def', title: 'B', author: undefined, annotations: undefined },
    ]);
    expect(site.issues).toEqual([{
      number: 1, title: 'Read', body: 'b', state: 'open', closedAt: undefined,
      labels: [{ name: 'reading', color: '#000' }], milestone: 'm1', dueOn: '2026-11-01',
      subtasks: [{ text: 'one', done: true }],
      notes: ['writing/Diary.md'], task: { note: 'writing/Diary.md', text: 'read' },
      timeline: [
        { kind: 'comment', body: 'a comment', createdAt: '2026-10-05' },
        { kind: 'event', event: 'closed', detail: 'x', createdAt: '2026-10-06' },
      ],
      createdAt: '2026-10-01', updatedAt: '2026-10-02',
    }]);
    expect(site.milestones).toEqual([{ id: 'm1', title: 'Autumn', description: undefined, dueOn: undefined, state: 'open' }]);
    expect(site.projects).toEqual([{
      id: 'p', title: 'Board', description: undefined, statuses: [{ id: 's1', name: 'To do', color: '#fff' }],
      items: [{ issue: 1, status: 's1', order: 0 }],
    }]);
  });

  test('built into the site dir, emptied; exported over a folder; pushed', async () => {
    const writes: { target: string; clear: boolean; files: SiteFile[] }[] = [];
    mockInvoke(invoke, {
      publish_write: (args: Record<string, unknown>) => {
        writes.push(args as never);
        return { files: (args.files as unknown[]).length, missing: [] };
      },
      publish_push: { branch: 'gh-pages', url: 'https://me.github.io/notes/' },
    });
    const options = { ...DEFAULT_OPTIONS, folders: ['writing/Blog'] };
    const built = await buildSiteTo(WS, options, siteDirOf(WS), {});
    expect(writes[0]).toMatchObject({ target: siteDirOf(WS), clear: true });
    const paths = writes[0].files.map((f) => f.path);
    expect(paths).toContain('notes/Blog/Hello.html');
    expect(paths).toContain('notes/Blog/Deep/Post.html');
    expect(paths.some((p) => p.includes('Diary'))).toBe(false);
    expect(built.pages).toBeGreaterThan(2);

    await buildSiteTo(WS, options, '/out', {});
    expect(writes[1]).toMatchObject({ target: '/out', clear: false });

    expect(await publishSite(WS, options, {})).toMatchObject({ branch: 'gh-pages', url: 'https://me.github.io/notes/' });
    expect(invoke).toHaveBeenCalledWith('publish_push', { dir: WS, site: siteDirOf(WS) });
  });
});

describe('PublishModal', () => {
  test('tick folders, export; publish needs the sync', async () => {
    let saved = '';
    mockInvoke(invoke, {
      read_file: () => saved,
      write_file: (args: Record<string, unknown>) => {
        saved = String(args.text);
        return true;
      },
      sync_info: { isRepo: false, hasToken: false, changes: 0 },
      publish_write: { files: 9, missing: ['writing/Blog/a.png'] },
    });
    usePublishUi.setState({ isOpen: true });
    render(<PublishModal />);
    const blog = await screen.findByRole('checkbox', { name: 'Blog' });
    expect(screen.getByText('(0 notes)')).toBeInTheDocument();
    fireEvent.click(blog);
    await waitFor(() => expect(JSON.parse(saved).folders).toEqual(['writing/Blog']));
    expect(screen.getByText('(2 notes)')).toBeInTheDocument();
    // its sub folder goes with it
    expect(screen.getByRole('checkbox', { name: 'Deep' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Deep' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Tag pages'));
    await waitFor(() => expect(JSON.parse(saved).tags).toBe(true));

    expect(screen.getByRole('button', { name: 'Publish to GitHub Pages' })).toBeDisabled();
    vi.mocked(dialog.open).mockResolvedValue('/out');
    fireEvent.click(screen.getByRole('button', { name: 'Export to folder…' }));
    expect(await screen.findByText(/pages written to \/out/)).toBeInTheDocument();
    expect(screen.getByText(/Not found, left out: writing\/Blog\/a.png/)).toBeInTheDocument();
    usePublishUi.setState({ isOpen: false });
  });

  test('published to the remote of the sync, its address shown', async () => {
    mockInvoke(invoke, {
      read_file: '{"folders":["writing/Blog"]}',
      sync_info: { isRepo: true, remoteUrl: 'https://github.com/me/notes.git', hasToken: true, changes: 0 },
      publish_write: { files: 9, missing: [] },
      publish_push: { branch: 'gh-pages', url: 'https://me.github.io/notes/' },
    });
    usePublishUi.setState({ isOpen: true });
    render(<PublishModal />);
    const button = await screen.findByRole('button', { name: 'Publish to GitHub Pages' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText(/pages pushed to gh-pages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'https://me.github.io/notes/' }));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://me.github.io/notes/' });
    usePublishUi.setState({ isOpen: false });
  });
});

describe('the diagrams drawn', () => {
  test('echarts as SVG, no animation', async () => {
    const svg = await siteRenderers.echarts!('{"xAxis":{"type":"category","data":["a","b"]},"yAxis":{},"series":[{"type":"bar","data":[1,2]}]}');
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 720 400"/);
    expect(svg).toContain('<path');
    await expect(siteRenderers.echarts!('not json')).rejects.toThrow();
  });
});

describe('PublishModal, drawing and issues', () => {
  test('draw toggles; the labels of the issues to publish', async () => {
    let saved = '{"issues":true}';
    mockInvoke(invoke, {
      read_file: (args: Record<string, unknown>) => (String(args.filePath).endsWith('publish.json') ? saved : ''),
      write_file: (args: Record<string, unknown>) => {
        saved = String(args.text);
        return true;
      },
      sync_info: { isRepo: false, hasToken: false, changes: 0 },
    });
    issueStore.setState({
      data: { ...defaultIssueData(), labels: [{ id: 'l1', name: 'public', color: '#000' }, { id: 'l2', name: 'private', color: '#fff' }] },
      dir: WS, layout: 'workspace', isLoaded: true,
    });
    usePublishUi.setState({ isOpen: true });
    render(<PublishModal />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'public' }));
    await waitFor(() => expect(JSON.parse(saved).issueLabels).toEqual(['public']));
    expect(screen.getByLabelText('Math')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Mermaid'));
    await waitFor(() => expect(JSON.parse(saved).mermaid).toBe(false));
    expect(JSON.parse(saved).echarts).toBe(true);
    usePublishUi.setState({ isOpen: false });
  });
});
