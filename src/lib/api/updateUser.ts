import { store } from 'lib/store';
import apiClient from 'lib/apiClient';
import type { User } from 'types/model';

export default async function updateDbUser(userid: string, to = 0|1) {
  to == 0 
    ? await apiClient
        .from<User>('users')
        .update({ note_tree: store.getState().noteTree })
        .eq('id', userid)
    : await apiClient
        .from<User>('users')
        .update({ wiki_tree: store.getState().wikiTree })
        .eq('id', userid)
}
