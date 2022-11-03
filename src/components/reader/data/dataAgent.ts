import { invoke } from "@tauri-apps/api";
import { ChannelType, ArticleType } from "./dataType";

export const getChannels = async (): Promise<ChannelType[]> => {
  return invoke('get_channels')
}

export const deleteChannel = async (feedUrl: string) => {
  return invoke('delete_channel', { feedUrl })
};

export const updateCountWithChannel = async (feedUrl: string): Promise<any> => {
  return {};
};

export const importChannels = async (list: string[]) => {
  return invoke('import_channels', { list })
}

export const getArticleList = async (feedUrl: string, filter: any) => {
  return invoke('get_articles', { feedUrl, filter })
}

export const fetchFeed = async (url: string): Promise<ChannelType & { items: ArticleType[] }> => {
  return invoke('fetch_feed', { url })
}

export const addChannel = async (url: string): Promise<number> => {
  return invoke('add_channel', { url })
}

export const syncArticlesWithChannel = async (feedUrl: string): Promise<number> => {
  return invoke('sync_articles_with_channel', { feedUrl })
}

export const getUnreadTotal = async (): Promise<{ [key: string]: number }> => {
  return invoke('get_unread_total')
}

export const updateArticleReadStatus = async (articleUrl: string, read_status: number) => {
  return invoke('update_article_read_status', {
    url: articleUrl,
    status: read_status,
  })
}

export const markAllRead = async (feedUrl: string) => {
  return invoke('mark_all_read', {
    channelUrl: feedUrl
  })
}

export const updateUserConfig = async (cfg: { [key: string]: any }) => {
  return invoke('update_user_config', {
    cfg
  })
}
