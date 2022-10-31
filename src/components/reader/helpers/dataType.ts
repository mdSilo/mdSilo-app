export interface ChannelType {
  id?: number;
  uuid: string;
  title: string;
  link: string;
  description: string;
  generator: string;
  language: string;
  published: string; // iso date string
  entries: ArticleType[];
  unread: number;
  ty?: string; // podcast | rss
}

export interface ArticleType {
  id?: number;
  uuid: string;
  title: string;
  url: string;
  description: string;
  published?: Date;
  author?: string;
  image?: string;
  content?: string;
  source?: string;
  links?: string[];
  ttr?: number;
  read_status: number;
}
