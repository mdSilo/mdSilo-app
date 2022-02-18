import { store } from 'lib/store';
import apiClient from 'lib/apiClient';
import type { Note, User } from 'types/model';
import type { PickPartial } from 'types/utils';
import { defaultUserId } from 'types/model';

// upsert
// 
export type NoteUpsert = PickPartial<
  Note,  // title, user_id required
  'id' | 'content' | 'md_content' | 'cover' | 'attr' | 'created_at' | 'updated_at' | 'is_pub' | 'is_wiki' | 'is_daily'
>;

export async function upsertDbNote(note: NoteUpsert, userId: string) {
  // for userId
  const isWiki = note.is_wiki;
  const user_id = isWiki ? defaultUserId : userId;
  const response = await apiClient
    .from<Note>('notes')
    .upsert(
      { ...note, user_id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id, title', ignoreDuplicates: isWiki }
    )
    .single();

  const data = response.data;
  if (data) {
    await apiClient
      .from<User>('users')
      .update({ note_tree: store.getState().noteTree });
    await apiClient
      .from<User>('users')
      .update({ wiki_tree: store.getState().wikiTree });
  }

  return response;
}

// update
// 
export type NoteUpdate = PickPartial<
  Note, // id required
  'title' | 'content' | 'user_id' | 'md_content' | 'cover' | 'attr' | 'created_at' | 'updated_at' | 'is_pub' | 'is_wiki' | 'is_daily'
>;

export async function updateDbNote(note: NoteUpdate, userId: string) {
  const user_id = note.is_wiki ? defaultUserId : userId;
  const response = await apiClient
    .from<Note>('notes')
    .update({ ...note, user_id, updated_at: new Date().toISOString() })
    .eq('id', note.id)
    .single();

  if (response.data) {
    // Update updated_at locally
    store
      .getState()
      .updateNote({ id: note.id, updated_at: response.data.updated_at });
  }

  return response;
}

// get
//
const selectColumns = 'id, title, content, user_id, md_content, cover, attr, created_at, updated_at, is_pub, is_wiki, is_daily';

export async function loadDbNote(noteId: string) {
  const response = await apiClient
    .from<Note>('notes')
    .select(selectColumns)
    .eq('id', noteId)
    .single();

  return response;
}

/**
 * load wiki note from db per keyword
 * @param kw 
 * @param n limit
 * @returns Response
 */
export async function loadDbWikiNotes(kw: string, n = 42) {
  const len = kw.trim().length;
  if (len <= 0) return;
  const kword = `%${kw.replaceAll(' ', '%')}%`;
  const response = await apiClient
    .from<Note>('notes')
    .select(selectColumns)
    .eq('is_wiki', true)
    .ilike('title', kword)
    .order('title')
    .limit(n);

  return response;
}

/**
 * load wiki note from db per title
 * @param noteTitle 
 * @returns Response
 */
export async function loadDbWikiNotePerTitle(noteTitle: string) {
  const response = await apiClient
    .from<Note>('notes')
    .select(selectColumns)
    .eq('is_wiki', true)
    .eq('title', noteTitle)
    .single();

  return response;
}


/* useless, to be del  */
/**
 * load note from db per title
 * @param noteTitle 
 * @returns Response
 */
export async function loadDbNotePerTitle(noteTitle: string) {
  const response = await apiClient
    .from<Note>('notes')
    .select(selectColumns)
    .eq('title', noteTitle)
    .single();

  return response;
}

// delete note from db
// 
export async function deleteDbNote(id: string, userId: string) {
  const response = await apiClient
    .from<Note>('notes')
    .delete()
    .match({'id': id, 'user_id': userId});

  await apiClient
    .from<User>('users')
    .update({ note_tree: store.getState().noteTree });

  return response;
}

/* end useless, to be del  */
