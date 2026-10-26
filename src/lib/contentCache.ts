import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Note } from 'types/model';
import { store } from './store';

/**
 * The content of notes not loaded in the store (see Note.parsed): read on
 * use, the last ones read kept, by their path and time, so a note changed
 * since is read again.
 */
export const CACHE_SIZE = 300;

const cache = new Map<string, string>();

const keyOf = (note: Pick<Note, 'id' | 'updated_at'>) => `${note.updated_at}\n${note.id}`;

function remember(key: string, content: string) {
  cache.delete(key);
  cache.set(key, content);
  // least recently used first
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** The content of a note: as in the store if loaded, else read (cached). */
export async function noteContent(id: string): Promise<string> {
  const note = store.getState().notes.get(id);
  if (note && !note.parsed) return note.content;
  const key = note ? keyOf(note) : `\n${id}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    remember(key, cached);
    return cached;
  }
  let content = '';
  try {
    content = (await invoke<string>('read_file', { filePath: id })) ?? '';
  } catch (e) {
    console.error(`Failed to read ${id}`, e);
  }
  remember(key, content);
  return content;
}

/** The notes with their content, the ones not loaded read (a few at a time). */
export async function withContents(notes: readonly Note[]): Promise<Note[]> {
  const out: Note[] = [];
  const BATCH = 16;
  for (let i = 0; i < notes.length; i += BATCH) {
    const batch = notes.slice(i, i + BATCH);
    const contents = await Promise.all(batch.map((n) => (n.parsed ? noteContent(n.id) : n.content)));
    batch.forEach((n, j) => out.push(n.parsed ? { ...n, content: contents[j], parsed: undefined } : n));
  }
  return out;
}

/** Forget the contents read; for tests. */
export function clearContentCache() {
  cache.clear();
}

/** The content of a note, read on use if not loaded; undefined meanwhile. */
export function useNoteContent(note: Note): string | undefined {
  const [content, setContent] = useState<string | undefined>(note.parsed ? undefined : note.content);
  useEffect(() => {
    if (!note.parsed) {
      setContent(note.content);
      return;
    }
    let cancelled = false;
    void noteContent(note.id).then((text) => { if (!cancelled) setContent(text); });
    return () => { cancelled = true; };
  }, [note]);
  return content;
}
