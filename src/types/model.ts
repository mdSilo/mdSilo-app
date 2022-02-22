import type { Descendant } from 'slate';
import { NoteTreeItem, WikiTreeItem } from 'lib/store';
import { getDefaultEditorValue } from 'editor/constants';

export type User = {
  id: string;
  subscription_id: string | null;
  note_tree: NoteTreeItem[];
  wiki_tree: WikiTreeItem[] | null;
};

export type Note = {
  id: string;
  title: string;
  content: Descendant[];
  user_id: User['id'] | null;
  md_content: string | null;
  cover: string | null;
  created_at: string;
  updated_at: string;
  is_pub: boolean;
  is_wiki: boolean;
  is_daily: boolean;
};

export const defaultUserId = '00000000-0000-0000-0000-000000000000';
export const defaultNote =  {
  title: 'untitled',
  content: getDefaultEditorValue(),
  user_id: defaultUserId,
  md_content: '',
  cover: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_pub: false,
  is_wiki: false,
  is_daily: false,
};
