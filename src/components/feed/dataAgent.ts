import { invoke } from "@tauri-apps/api";
import { ChannelType, ArticleType } from "types/model";

type FeedResult = {
  channel: ChannelType;
  articles: ArticleType[];
};

export const fetchFeed = async (url: string): Promise<FeedResult> => {
  return await invoke('fetch_feed', { url })
}

export const addChannel = async (
  url: string, ty: string, title: string | null
): Promise<number> => {
  return await invoke('add_channel', { url, ty, title })
}

export const importChannels = async (list: string[]) => {
  return await invoke('import_channels', { list })
}

export const getChannels = async (): Promise<ChannelType[]> => {
  return await invoke('get_channels')
}

export const deleteChannel = async (link: string) => {
  return await invoke('delete_channel', { link })
};

export const getArticleList = async (
  feedLink: string | null, 
  readStatus: number | null,
  starStatus: number | null,
) : Promise<ArticleType[]> => {
  return await invoke('get_articles', { feedLink, readStatus, starStatus })
}

export const getArticleByUrl = async (url: string): Promise<ArticleType | null> => {
  return await invoke('get_article_by_url', { url })
}

export const getUnreadNum = async (): Promise<{ [key: string]: number }> => {
  return await invoke('get_unread_num')
}

export const updateArticleStarStatus = async (
  articleUrl: string, 
  star_status: number, // 0 || 1
): Promise<number> => {
  return await invoke('update_article_star_status', {
    url: articleUrl,
    status: star_status,
  })
}

export const updateArticleReadStatus = async (
  articleUrl: string, 
  read_status: number,
): Promise<number> => {
  return await invoke('update_article_read_status', {
    url: articleUrl,
    status: read_status,
  })
}

export const updateAllReadStatus = async (
  feedLink: string, 
  readStatus: number,
): Promise<number> => {
  return await invoke('update_all_read_status', { feedLink, readStatus })
}
