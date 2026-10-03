import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store, SidebarTab } from 'lib/store';
import type { ArticleType, ChannelType } from 'types/model';
import { mockInvoke } from '../../testUtils';
import AudioPlayer from './AudioPlayer';
import { ChannelList } from './ChannelList';
import { Channel } from './Channel';
import { ArticleView } from './ArticleView';
import { FeedManager } from './FeedManager';

const channel = (partial: Partial<ChannelType> = {}): ChannelType => ({
  id: 1,
  title: 'Tech News',
  link: 'https://tech.example/feed',
  ty: 'rss',
  unread: 3,
  ...partial,
});

const article = (partial: Partial<ArticleType> = {}): ArticleType => ({
  id: 1,
  title: 'Article One',
  url: 'https://tech.example/1',
  feed_link: 'https://tech.example/feed',
  audio_url: '',
  description: 'desc',
  published: new Date('2022-01-02T00:00:00Z'),
  read_status: 0,
  star_status: 0,
  ...partial,
});

describe('AudioPlayer', () => {
  const pods = [
    { title: 'Ep 1', audio_url: 'ep1.mp3', url: 'a1', feed_link: 'f' },
    { title: 'Ep 2', audio_url: 'ep2.mp3', url: 'a2', feed_link: 'f' },
  ];

  test('shows a placeholder without a pod', async () => {
    mockInvoke(invoke, { get_articles: [] });
    await act(async () => {
      render(<AudioPlayer currentPod={null} />);
    });
    expect(screen.getByText('no player')).toBeInTheDocument();
  });

  test('plays the next track when one ends', async () => {
    mockInvoke(invoke, { get_articles: pods });
    await act(async () => {
      render(<AudioPlayer currentPod={{ title: 'Ep 1', url: 'ep1.mp3', article_url: 'a1', feed_link: 'f' }} />);
    });
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio).toHaveAttribute('src', 'ep1.mp3');
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_articles', expect.anything()));
    await act(async () => {
      fireEvent.ended(audio);
    });
    expect(document.querySelector('audio')).toHaveAttribute('src', 'ep2.mp3');
    expect(store.getState().currentPod?.url).toBe('ep2.mp3');
    // last track: nothing further
    await act(async () => {
      fireEvent.error(document.querySelector('audio') as HTMLAudioElement);
    });
    expect(document.querySelector('audio')).toHaveAttribute('src', 'ep2.mp3');
  });

  test('playlist button opens the playlist tab', async () => {
    mockInvoke(invoke, { get_articles: [] });
    store.getState().setIsSidebarOpen(false);
    await act(async () => {
      render(<AudioPlayer currentPod={{ title: 'Ep', url: 'x.mp3', article_url: 'a', feed_link: 'f' }} />);
    });
    await userEvent.click(screen.getByRole('button'));
    expect(store.getState().isSidebarOpen).toBe(true);
    expect(store.getState().sidebarTab).toBe(SidebarTab.Playlist);
  });
});

describe('ChannelList', () => {
  const props = () => ({
    channelList: [channel(), channel({ id: 2, title: 'Pod Show', link: 'https://pod.example/rss', ty: 'podcast', unread: 0 })],
    refreshList: vi.fn(async () => undefined),
    onShowManager: vi.fn(),
    onClickFeed: vi.fn(async () => undefined),
    onClickStar: vi.fn(async () => undefined),
    refreshing: false,
    doneNum: 0,
  });

  test('lists channels with unread counts and favicons', () => {
    render(<ChannelList {...props()} />);
    expect(screen.getByText('Tech News')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://icons.duckduckgo.com/ip3/tech.example.ico');
  });

  test('handles clicks', async () => {
    const p = props();
    render(<ChannelList {...p} />);
    await userEvent.click(screen.getByText('Pod Show'));
    expect(p.onClickFeed).toHaveBeenCalledWith('https://pod.example/rss');
    expect(screen.getByText('Pod Show').closest('.cursor-pointer')).toHaveClass('border-green-500');
    await userEvent.click(screen.getByText('Starred'));
    expect(p.onClickStar).toHaveBeenCalled();
    const [refresh, manage] = screen.getAllByRole('button');
    await userEvent.click(refresh);
    expect(p.refreshList).toHaveBeenCalled();
    await userEvent.click(manage);
    expect(p.onShowManager).toHaveBeenCalled();
  });

  test('shows refresh progress', () => {
    render(<ChannelList {...props()} refreshing doneNum={1} />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});

describe('Channel', () => {
  const base = () => ({
    channel: channel(),
    articles: [
      article({ id: 1, title: 'Old read', read_status: 1, published: new Date('2022-01-01') }),
      article({ id: 2, title: 'New unread', read_status: 0, published: new Date('2022-01-03') }),
      article({ id: 3, title: 'Old unread', read_status: 0, published: new Date('2022-01-02') }),
    ],
    handleRefresh: vi.fn(async () => undefined),
    updateAllReadStatus: vi.fn(async () => undefined),
    onClickArticle: vi.fn(async () => undefined),
    loading: false,
    syncing: false,
  });

  test('shows a spinner while loading and nothing without articles', () => {
    const { rerender, container } = render(<Channel {...base()} loading />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    rerender(<Channel {...base()} articles={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('sorts unread first, then newest', () => {
    render(<Channel {...base()} />);
    const titles = screen.getAllByText(/unread|read$/).map((e) => e.textContent);
    expect(titles).toEqual(['New unread', 'Old unread', 'Old read']);
  });

  test('marks articles read on click and handles actions', async () => {
    const p = base();
    render(<Channel {...p} syncing />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    const item = screen.getByText('New unread').closest('[aria-hidden]') as HTMLElement;
    expect(item.querySelector('svg')).toBeInTheDocument();
    await userEvent.click(item);
    expect(p.onClickArticle).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    expect(item).toHaveClass('bg-blue-200');
    expect(item.querySelector('svg')).not.toBeInTheDocument();

    const [markAll, refresh] = screen.getAllByRole('button');
    await userEvent.click(markAll);
    expect(p.updateAllReadStatus).toHaveBeenCalledWith('https://tech.example/feed', 1);
    await userEvent.click(refresh);
    expect(p.handleRefresh).toHaveBeenCalled();
  });

  test('titles the starred channel', () => {
    render(<Channel {...base()} channel={null} starChannel />);
    expect(screen.getByText('Starred')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ArticleView', () => {
  test('renders nothing without an article', () => {
    const { container } = render(<ArticleView article={null} starArticle={vi.fn()} hideChannelCol={vi.fn()} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  test('renders content and opens links in a new tab', () => {
    render(
      <ArticleView
        article={article({ content: '<p>Body <a href="https://x.y">link</a> <a target="_self" href="z">keep</a></p>', author: 'Ann' })}
        starArticle={vi.fn()}
        hideChannelCol={vi.fn()}
      />
    );
    expect(screen.getByText('Article One')).toBeInTheDocument();
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('link')).toHaveAttribute('target', '_blank');
    expect(screen.getByText('keep')).toHaveAttribute('target', '_self');
  });

  test('falls back to the description', () => {
    render(<ArticleView article={article({ description: '<b>only desc</b>' })} starArticle={vi.fn()} hideChannelCol={vi.fn()} />);
    expect(screen.getByText('only desc')).toBeInTheDocument();
  });

  test('stars, hides the channel column and plays audio', async () => {
    const starArticle = vi.fn(async () => undefined);
    const hideChannelCol = vi.fn();
    const { container } = render(
      <ArticleView article={article({ audio_url: 'ep.mp3' })} starArticle={starArticle} hideChannelCol={hideChannelCol} />
    );
    const clickable = container.querySelectorAll('span.cursor-pointer');
    await userEvent.click(clickable[0]);
    expect(hideChannelCol).toHaveBeenCalled();
    await userEvent.click(clickable[1]);
    expect(starArticle).toHaveBeenCalledWith('https://tech.example/1', 1);
    expect(clickable[1].querySelector('svg')).toHaveClass('fill-red-500');
    await userEvent.click(clickable[2]);
    expect(store.getState().currentPod).toMatchObject({ title: 'Article One', url: 'ep.mp3', article_url: 'https://tech.example/1' });
  });
});

describe('FeedManager', () => {
  const channels = [channel(), channel({ id: 2, title: 'Pod Show', link: 'https://pod.example/rss', ty: 'podcast' })];

  test('filters channels and deletes', async () => {
    const handleDelete = vi.fn(async () => undefined);
    render(<FeedManager channelList={channels} handleAddFeed={vi.fn()} handleDelete={handleDelete} />);
    await userEvent.type(screen.getByPlaceholderText('Search Feed'), 'pod{enter}');
    expect(screen.queryByText('Tech News')).not.toBeInTheDocument();
    expect(screen.getByText('Pod Show')).toBeInTheDocument();
    await userEvent.click(screen.getByText('https://pod.example/rss').nextSibling as HTMLElement);
    expect(handleDelete).toHaveBeenCalledWith(channels[1]);
    await userEvent.clear(screen.getByPlaceholderText('Search Feed'));
    expect(screen.getByText('Tech News')).toBeInTheDocument();
  });

  test('loads feed info and saves a new feed', async () => {
    mockInvoke(invoke, { fetch_feed: { channel: { title: 'Fetched', description: 'About it' }, articles: [] } });
    const handleAddFeed = vi.fn(async () => undefined);
    render(<FeedManager channelList={[]} handleAddFeed={handleAddFeed} handleDelete={vi.fn()} />);
    await userEvent.click(screen.getAllByRole('button')[0]);
    const url = screen.getByPlaceholderText('Feed URL');
    await userEvent.clear(url);
    await userEvent.type(url, 'https://new.example/rss');
    await userEvent.click(screen.getByText('Load'));
    expect(invoke).toHaveBeenCalledWith('fetch_feed', { url: 'https://new.example/rss' });
    expect(await screen.findByDisplayValue('Fetched')).toBeInTheDocument();
    expect(screen.getByText('About it')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Podcast'));
    await userEvent.click(screen.getByText('OK'));
    expect(handleAddFeed).toHaveBeenCalledWith('https://new.example/rss', 'podcast', 'Fetched');
    expect(screen.queryByPlaceholderText('Feed URL')).not.toBeInTheDocument();
  });

  test('reports when no feed is found and cancels', async () => {
    render(<FeedManager channelList={[]} handleAddFeed={vi.fn()} handleDelete={vi.fn()} />);
    await userEvent.click(screen.getAllByRole('button')[0]);
    await userEvent.click(screen.getByText('Load'));
    expect(await screen.findByText('Cannot find any feed, please check the URL')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Feed URL')).not.toBeInTheDocument();
  });
});
