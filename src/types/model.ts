import type { Parsed } from '@/lib/parseNote';

// READING
//
export interface ChannelType {
  id: number;
  title: string;
  link: string;
  description?: string;
  published?: string; // iso date string
  ty: string; // podcast | rss
  unread: number;
}

export interface ArticleType {
  id: number;
  title: string;
  url: string;
  feed_link: string;
  audio_url: string;
  description: string;
  published?: Date;
  read_status: number;
  star_status: number;
  content?: string;
  author?: string;
  image?: string;
  source?: string;
  links?: string[];
  ttr?: number;
}

export interface PodType {
  title: string;
  url: string;
  published?: Date;
  article_url: string;
  feed_link: string;
}

// WRITING
// 
export type Note = {
  id: string;  // !!Important!! id === file_path
  title: string;
  content: string;
  file_path: string;
  cover: string | null;
  created_at: string;
  updated_at: string;
  is_daily: boolean;
  is_dir?: boolean;
  /**
   * What the note links to and contains, from the index of the workspace:
   * set while its content is not loaded (content ''), see lib/parseNote
   */
  parsed?: Parsed;
};

export const defaultNote =  {
  title: 'untitled',
  content: ' ',
  file_path: '',
  cover: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_daily: false,
};
