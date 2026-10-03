import { describe, expect, test, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import * as dataAgent from './dataAgent';

describe('feed dataAgent', () => {
  test.each([
    ['fetchFeed', () => dataAgent.fetchFeed('u'), 'fetch_feed', { url: 'u' }],
    ['addChannel', () => dataAgent.addChannel('u', 'rss', 't'), 'add_channel', { url: 'u', ty: 'rss', title: 't' }],
    ['importChannels', () => dataAgent.importChannels(['a', 'b']), 'import_channels', { list: ['a', 'b'] }],
    ['getChannels', () => dataAgent.getChannels(), 'get_channels', undefined],
    ['deleteChannel', () => dataAgent.deleteChannel('l'), 'delete_channel', { link: 'l' }],
    [
      'getArticleList',
      () => dataAgent.getArticleList('l', 0, null),
      'get_articles',
      { feedLink: 'l', readStatus: 0, starStatus: null },
    ],
    ['getArticleByUrl', () => dataAgent.getArticleByUrl('u'), 'get_article_by_url', { url: 'u' }],
    ['getUnreadNum', () => dataAgent.getUnreadNum(), 'get_unread_num', undefined],
    [
      'updateArticleStarStatus',
      () => dataAgent.updateArticleStarStatus('u', 1),
      'update_article_star_status',
      { url: 'u', status: 1 },
    ],
    [
      'updateArticleReadStatus',
      () => dataAgent.updateArticleReadStatus('u', 1),
      'update_article_read_status',
      { url: 'u', status: 1 },
    ],
    [
      'updateAllReadStatus',
      () => dataAgent.updateAllReadStatus('l', 1),
      'update_all_read_status',
      { feedLink: 'l', readStatus: 1 },
    ],
  ])('%s invokes %s', async (_name, call, cmd, args) => {
    (invoke as Mock).mockResolvedValueOnce('ok');
    await expect(call()).resolves.toBe('ok');
    if (args === undefined) {
      expect(invoke).toHaveBeenCalledWith(cmd);
    } else {
      expect(invoke).toHaveBeenCalledWith(cmd, args);
    }
  });
});
