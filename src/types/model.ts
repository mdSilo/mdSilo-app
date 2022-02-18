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
  attr: Attr | null;
  created_at: string;
  updated_at: string;
  is_pub: boolean;
  is_wiki: boolean;
  is_daily: boolean;
};

export type Attr = { -readonly [key in string]-?: string };
// export interface Attr {
//   Type: string;
//   Author: string;
//   Publisher: string;
//   Publish: string;
//   UID: string;
//   Link: string;
// }

export const defaultAttr: Attr = {
  Type: '',
  Author: '',
  Publisher: '',
  Publish: '',
  UID: '',
  Link: '',
};
export const defaultUserId =  '00000000-0000-0000-0000-000000000000';
export const defaultNote =  {
  title: 'untitled',
  content: getDefaultEditorValue(),
  user_id: defaultUserId,
  md_content: '',
  cover: '',
  attr: defaultAttr,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_pub: false,
  is_wiki: false,
  is_daily: false,
};

export function buildAttr(k: string, v: string) {
  switch (k) {
    case 'Type':
      return {Type: v};
    case 'Author':
      return {Author: v};
    case 'Publish':
      return {Publish: v};
    case 'Publisher':
      return {Publisher: v};
    case 'UID':
      return {UID: v};
    case 'Link':
      return {Link: v};
    default:
      return {};
  }
}