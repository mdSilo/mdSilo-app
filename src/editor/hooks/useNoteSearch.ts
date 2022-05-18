import { useCallback } from 'react';
import { parser } from "mdsmirror";
import Fuse from 'fuse.js';
import { store } from 'lib/store';
import { Note } from 'types/model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NoteBlock = { text: string; path?: any };

type FuseDatum = {
  id: string;
  title: string;
  file_path: string;
  update_at: string;
  blocks?: NoteBlock[];
};

type searchOptions = {
  numOfResults?: number;
  searchContent?: boolean;
  extendedSearch?: boolean;
  searchWiki?: boolean;
  searchDir?: boolean;
  notesBase?: Note[];
};

// search Notes per kw or hashtag
export default function useNoteSearch({
  numOfResults = -1,
  searchContent = false,
  extendedSearch = false,
  searchWiki = false,
  searchDir = false,
  notesBase = [],
}: searchOptions = {}) {
  const myNotes = useCallback(() => {
    const notes = store.getState().notes;
    const notesArr = Object.values(notes);
    const dirNotes = searchDir 
      ? notesArr.filter(n => n.is_dir) 
      : notesArr.filter(n => !n.is_dir);
    const allNotes = searchWiki 
      ? dirNotes.filter(n => n.is_wiki) 
      : dirNotes.filter(n => !n.is_wiki);
    return allNotes;
  }, [searchDir, searchWiki]);

  const search = useCallback(
    (searchText: string) => {
      const fuse = initFuse(
        notesBase.length > 0 ? notesBase : myNotes(),
        searchContent,
        extendedSearch
      );
      return fuse.search(searchText.trim(), { limit: numOfResults });
    },
    [numOfResults, searchContent, extendedSearch, myNotes, notesBase]
  );
  return search;
}

// Initializes Fuse
const initFuse = (
  notes: Note[],
  searchContent: boolean,
  extendedSearch: boolean
) => {
  const fuseData = getFuseData(notes, searchContent);
  const keys = searchContent ? ['blocks.text'] : ['title'];
  return new Fuse<FuseDatum>(fuseData, {
    useExtendedSearch: extendedSearch,
    keys,
    ignoreLocation: true,
    ...(searchContent
      ? {
          includeMatches: true,
          threshold: 0,
          sortFn: (a, b) => a.idx - b.idx,
        }
      : { threshold: 0.1 }),
  });
};

// Returns the data that should be passed in when instantiating the Fuse client.
const getFuseData = (notes: Note[], searchContent: boolean): FuseDatum[] => {
  return notes.map(
    (note): FuseDatum => ({
      id: note.id,
      title: note.title,
      file_path: note.file_path,
      update_at: note.updated_at,
      ...(searchContent ? { blocks: flattenContent(note.content) } : {}),
    })
  );
};

// Flatten the content into individual lines
// TODO 
const flattenContent = (content: string): NoteBlock[] => {
  const docAST = parser.parse(content);
  const result: NoteBlock[] = docAST.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((node: any) => node.isBlock)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((node: any) => { 
      const block = { text: node.textContent, path: []};
      return block;
    });
  return result;
};
