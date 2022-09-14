import { NoteTreeItem } from 'lib/store';

export type User = {
  id: string;
  subscription_id: string | null;
  note_tree: NoteTreeItem[];
};

export type Note = {
  id: string;  // !!Important!! id === file_path
  title: string;
  content: string;
  file_path: string;
  cover: string | null;
  created_at: string;
  updated_at: string;
  is_daily: boolean;
  user_id?: User['id'] | null;
  not_process?: boolean;
  is_dir?: boolean;
};

export const defaultUserId = '00000000-0000-0000-0000-000000000000';
export const defaultNote =  {
  title: 'untitled',
  content: ' ',
  file_path: '',
  cover: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_daily: false,
};
