import { invoke } from "@tauri-apps/api";
import { ChannelType, ArticleType } from "./dataType";

type RssResult = {
  channel: ChannelType;
  articles: ArticleType[];
};

export const fetchFeed = async (url: string): Promise<RssResult> => {
  return await invoke('fetch_feed', { url })
}

export const addChannel = async (url: string, title: string | null): Promise<number> => {
  return await invoke('add_channel', { url, title })
}

export const importChannels = async (list: string[]) => {
  return await invoke('import_channels', { list })
}

export const getChannels = async (): Promise<ChannelType[]> => {
  return await invoke('get_channels')
}

export const deleteChannel = async (feedUrl: string) => {
  return await invoke('delete_channel', { feedUrl })
};

export const updateCountWithChannel = async (feedUrl: string): Promise<any> => {
  return {};
};

export const getArticleList = async (
  feedLink: string, 
  read_status: number | null
) : Promise<ArticleType[]> => {
  return await invoke('get_articles', { feedLink, read_status })
}

export const addArticlesWithChannel = async (feedLink: string): Promise<number> => {
  return await invoke('add_articles_with_channel', { link: feedLink })
}

export const getUnreadNum = async (): Promise<{ [key: string]: number }> => {
  return await invoke('get_unread_num')
}

export const updateArticleReadStatus = async (articleUrl: string, read_status: number) => {
  return await invoke('update_article_read_status', {
    url: articleUrl,
    status: read_status,
  })
}

export const markAllRead = async (feedLink: string) => {
  return await invoke('mark_all_read', { feedLink })
}
