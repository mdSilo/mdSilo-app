import { NoteTreeItem, WikiTreeItem } from 'lib/store';

export type User = {
  id: string;
  subscription_id: string | null;
  note_tree: NoteTreeItem[];
  wiki_tree: WikiTreeItem[] | null;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  user_id: User['id'] | null;
  cover: string | null;
  created_at: string;
  updated_at: string;
  is_pub: boolean;
  is_wiki: boolean;
  is_daily: boolean;
  not_process?: boolean;
  file_path?: string;
};

export const defaultUserId = '00000000-0000-0000-0000-000000000000';
export const defaultNote =  {
  title: 'untitled',
  content: '',
  user_id: defaultUserId,
  cover: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_pub: false,
  is_wiki: false,
  is_daily: false,
};
