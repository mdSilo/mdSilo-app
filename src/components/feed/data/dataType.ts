export interface ChannelType {
  id?: number;
  title: string;
  link: string;
  description?: string;
  published?: string; // iso date string
  ty: string; // podcast | rss
  unread: number;
}

export interface ArticleType {
  id?: number;
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

export interface CurrentPod {
  title: string;
  url: string;
}
