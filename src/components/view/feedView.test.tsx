import { describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store } from 'lib/store';
import { mockInvoke, renderWithView } from '../../testUtils';
import Feed from './feed';

const channels = [
  { id: 1, title: 'Tech', link: 'https://tech/feed', ty: 'rss', unread: 0 },
  { id: 2, title: 'Pods', link: 'https://pods/feed', ty: 'podcast', unread: 0 },
];
const articles = [
  { id: 10, title: 'Hello world', url: 'https://tech/1', feed_link: 'https://tech/feed', audio_url: '', description: 'd', read_status: 0, star_status: 0, content: '<p>Body text</p>' },
];

const setup = (extra: Record<string, unknown> = {}) => {
  mockInvoke(invoke, {
    get_channels: () => channels.map((c) => ({ ...c })),
    get_unread_num: { 'https://tech/feed': 5 },
    get_articles: ({ starStatus }: Record<string, unknown>) =>
      starStatus === 1 ? [{ ...articles[0], id: 11, title: 'Starred one' }] : articles,
    add_channel: 1,
    update_article_read_status: 1,
    update_all_read_status: 1,
    ...extra,
  });
  renderWithView(<Feed />);
};

describe('Feed view', () => {
  test('lists channels with unread counts', async () => {
    setup();
    expect(await screen.findByText('Tech')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('opens a channel and reads an article', async () => {
    setup();
    await userEvent.click(await screen.findByText('Tech'));
    expect(invoke).toHaveBeenCalledWith('get_articles', { feedLink: 'https://tech/feed', readStatus: null, starStatus: null });
    await userEvent.click(await screen.findByText('Hello world'));
    expect(await screen.findByText('Body text')).toBeInTheDocument();
    expect(store.getState().currentArticle?.id).toBe(10);
    expect(invoke).toHaveBeenCalledWith('update_article_read_status', { url: 'https://tech/1', status: 1 });
  });

  test('shows starred articles', async () => {
    setup();
    await userEvent.click(await screen.findByText('Starred'));
    expect(await screen.findByText('Starred one')).toBeInTheDocument();
  });

  test('refreshes all channels', async () => {
    setup();
    await screen.findByText('Tech');
    await userEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('add_channel', { url: 'https://pods/feed', ty: 'podcast', title: 'Pods' }));
    expect(invoke).toHaveBeenCalledWith('add_channel', { url: 'https://tech/feed', ty: 'rss', title: 'Tech' });
  });

  test('channel actions: mark all read and refresh', async () => {
    setup();
    await userEvent.click(await screen.findByText('Tech'));
    await screen.findByText('Hello world');
    const header = screen.getAllByText('Tech').at(-1)?.parentElement as HTMLElement;
    const [markAll, refresh] = Array.from(header.querySelectorAll('button'));
    await userEvent.click(markAll);
    expect(invoke).toHaveBeenCalledWith('update_all_read_status', { feedLink: 'https://tech/feed', readStatus: 1 });
    await userEvent.click(refresh);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('add_channel', { url: 'https://tech/feed', ty: 'rss', title: 'Tech' }));
  });

  test('manages channels: add and delete', async () => {
    mockInvoke(invoke, {});
    setup({ fetch_feed: { channel: { title: 'New', description: '' }, articles: [] } });
    await screen.findByText('Tech');
    await userEvent.click(screen.getAllByRole('button')[1]);
    expect(screen.getByPlaceholderText('Search Feed')).toBeInTheDocument();
    await userEvent.click(screen.getByText('https://pods/feed').nextSibling as HTMLElement);
    expect(invoke).toHaveBeenCalledWith('delete_channel', { link: 'https://pods/feed' });

    await userEvent.click(screen.getAllByRole('button').find((b) => b.className.includes('bg-primary-200')) as HTMLElement);
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('add_channel', expect.objectContaining({ ty: 'rss' }))
    );
  });

  test('stars an article and hides the channel column', async () => {
    setup({ update_article_star_status: 1 });
    await userEvent.click(await screen.findByText('Tech'));
    await userEvent.click(await screen.findByText('Hello world'));
    await screen.findByText('Body text');
    const spans = document.querySelectorAll('span.cursor-pointer');
    await userEvent.click(spans[1]);
    expect(invoke).toHaveBeenCalledWith('update_article_star_status', { url: 'https://tech/1', status: 1 });
    await userEvent.click(spans[0]);
    expect(document.querySelector('.w-48')).toHaveClass('hidden');
  });

  test('shows the store article when none is selected', async () => {
    store.getState().setCurrentArticle({ ...articles[0], content: '<p>From store</p>' } as never);
    setup();
    expect(await screen.findByText('From store')).toBeInTheDocument();
  });
});

vi.setConfig({ testTimeout: 15000 });
