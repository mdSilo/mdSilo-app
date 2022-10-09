import { useCallback } from 'react';
import { parser } from "mdsmirror";
import Fuse from 'fuse.js';
import { store } from 'lib/store';
import { Note } from 'types/model';
import { loadDir } from 'file/open';

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
  searchDir?: boolean;
  notesBase?: Note[];
};

// search Notes per kw
export default function useNoteSearch({
  numOfResults = -1,
  searchContent = false,
  extendedSearch = false,
  searchDir = false,
  notesBase = [],
}: searchOptions = {}) {
  const myNotes = useCallback(() => {
    const isLoaded = store.getState().isLoaded;
    const initDir = store.getState().initDir;
    // console.log("s loaded?", isLoaded);
    if (!isLoaded && initDir) {
      loadDir(initDir).then(() => store.getState().setIsLoaded(true));
    }

    const notes = store.getState().notes;
    const notesArr = Object.values(notes);
    const allNotes = searchDir 
      ? notesArr.filter(n => n.is_dir) 
      : notesArr.filter(n => !n.is_dir);
    
    return allNotes;
  }, [searchDir]);

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
// TODO: def path to scroll to searched anchor
const flattenContent = (content: string): NoteBlock[] => {
  const docAST = parser.parse(content);
  // console.log("search doc ast: ", docAST);
  const result: NoteBlock[] = docAST.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // .filter((node: any) => node.type.name == 'hashtag')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((node: any) => { 
      const block = { text: node.textContent, path: []};
      return block;
    });
  return result;
};
