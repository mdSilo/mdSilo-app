import { useCallback, useMemo } from 'react';
import Fuse, { type FuseResult } from 'fuse.js';
import { invoke } from '@tauri-apps/api/core';
import { getJSONContent, parser } from "mdsmirror";
import { NoteMap, store, useStore } from 'lib/store';
import { indexOf } from 'lib/linkIndex';
import { withContents } from 'lib/contentCache';
import { Note } from 'types/model';
import { loadDir } from 'file/open';
import { checkFileIsMd } from 'file/process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoteBlock = { text: string; path?: any };

const EMPTY_NOTES: Note[] = [];

export type FuseDatum = {
  id: string;
  title: string;
  file_path: string;
  update_at: string;
  blocks?: NoteBlock[];
};

type searchOptions = {
  numOfResults?: number;
  searchContent?: boolean;
  searchHashTag?: boolean;
  extendedSearch?: boolean;
  searchDir?: boolean;
  notesBase?: Note[];
};

// search Notes per kw
export default function useNoteSearch({
  numOfResults = -1,
  searchContent = false,
  searchHashTag = false,
  extendedSearch = false,
  searchDir = false,
  notesBase = EMPTY_NOTES,
}: searchOptions = {}) {
  const notes = useStore((state) => state.notes);
  const fuse = useMemo(() => {
    const searchNotes = notesBase.length > 0
      ? notesBase
      : notes.values().filter((note) =>
          searchDir
            ? note.is_dir
            : !note.is_dir && checkFileIsMd(note.id)
        );
    return initFuse(searchNotes, searchContent, searchHashTag, extendedSearch);
  }, [notes, notesBase, searchDir, searchContent, searchHashTag, extendedSearch]);

  const search = useCallback((searchText: string) => {
    const isLoaded = store.getState().isLoaded;
    const initDir = store.getState().initDir;
    // console.log("s loaded?", isLoaded);
    if (!isLoaded && initDir) {
      void loadDir(initDir);
    }

    const query = searchText.trim();
    return query ? fuse.search(query, { limit: numOfResults }) : [];
  }, [fuse, numOfResults]);
  return search;
}

/** A section of a book found by the search of the index. */
export type BookHit = { id: string; title: string; label: string; snippet: string };

export type ContentSearch = { notes: FuseResult<FuseDatum>[]; books: BookHit[] };

type IndexHit = { id: string; path: string; kind: string; title: string; label: string; snippet: string };

/** The words of a query, without the operators of the fuse extended search. */
const plainWords = (query: string) => query.replace(/[!^$'=|"]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Search the content of the notes (or their #tags#), by blocks: the full-text
 * search of the index finds the notes, which are read to find the blocks;
 * and the books whose text has the words.
 */
export async function searchContent(
  notes: NoteMap,
  query: string,
  ty: 'content' | 'hashtag',
): Promise<ContentSearch> {
  const keyword = query.trim();
  if (!keyword) return { notes: [], books: [] };
  const mds = notes.values().filter((n) => !n.is_dir && checkFileIsMd(n.id));
  let candidates: Note[];
  let books: BookHit[] = [];
  if (ty === 'hashtag') {
    // the notes with a tag like it
    const tag = keyword.replace(/^#|#$/g, '').toLowerCase();
    const index = indexOf(notes);
    candidates = mds.filter((n) => index.tags(n.id).some((t) => t.toLowerCase().includes(tag)));
  } else {
    let hits: IndexHit[] | undefined;
    try {
      hits = await invoke<IndexHit[]>('index_search', { query: plainWords(keyword), kind: null, limit: 300 });
    } catch {
      hits = undefined; // no index: in all the notes
    }
    if (hits) {
      const found = new Set(hits.filter((h) => h.kind === 'note').map((h) => h.path));
      const lower = keyword.toLowerCase();
      // the notes loaded, maybe changed since indexed
      candidates = mds.filter((n) => found.has(n.id) || (!n.parsed && n.content.toLowerCase().includes(lower)));
      books = hits.filter((h) => h.kind === 'book')
        .map(({ id, title, label, snippet }) => ({ id, title, label, snippet }));
    } else {
      candidates = [...mds];
    }
  }
  const loaded = await withContents(candidates);
  const fuse = initFuse(loaded, ty === 'content', ty === 'hashtag', true);
  return { notes: fuse.search(keyword), books };
}

// Initializes Fuse
const initFuse = (
  notes: Note[],
  searchContent: boolean,
  searchHashTag: boolean,
  extendedSearch: boolean
) => {
  const fuseData = getFuseData(notes, searchContent, searchHashTag);
  const keys = searchContent || searchHashTag ? ['blocks.text'] : ['title'];
  return new Fuse<FuseDatum>(fuseData, {
    useExtendedSearch: extendedSearch,
    keys,
    ignoreLocation: true,
    ...(searchContent || searchHashTag
      ? {
          includeMatches: true,
          threshold: 0,
          sortFn: (a, b) => a.idx - b.idx,
        }
      : { threshold: 0.1 }),
  });
};

// Returns the data that should be passed in when instantiating the Fuse client.
const getFuseData = (
  notes: Note[], 
  searchContent: boolean, 
  searchHashTag: boolean
): FuseDatum[] => {
  return notes.map(
    (note): FuseDatum => ({
      id: note.id,
      title: note.title,
      file_path: note.file_path,
      update_at: note.updated_at,
      ...(
        searchHashTag 
          ? { blocks: searchTagContent(note.content) } 
          : searchContent 
            ? {blocks: flattenContent(note.content)}
            : {}
      ),
    })
  );
};

// Flatten the content into individual lines
// TODO: def path to scroll to searched anchor
const flattenContent = (content: string): NoteBlock[] => {
  const docAST = parser.parse(content);
  // console.log("search doc ast: ", docAST);
  const result: NoteBlock[] = docAST.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((node: any) => { 
      const block = { text: node.textContent, path: []};
      return block;
    });
  
  return result;
};

const searchTagContent = (content: string) => {
  const out: NoteBlock[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findTag = (node: any, context?: any) => {
    if (node.text && node.marks && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type === "hashtag") {
          out.push({ 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            text: context?.reduce((res: string, node: any) => res + ' ' + (node.text || ''), '') || node.text, 
            path: [] 
          })
          
        }
      }
    }
    // recursively
    if (node.content?.length > 0) {
      for (const n of node.content) {
        findTag(n, node.content);
      }
    }

    return out;
  }

  const doc = parser.parse(content);
  // console.log(">> doc: ", doc, content)
  const json = getJSONContent(doc); 
  // console.log(">>json: ", noteTitle, json)
  const result: NoteBlock[] = findTag(json);

  return result;
};
