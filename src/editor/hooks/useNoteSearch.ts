import { useCallback } from 'react';
import { getJSONContent, parser } from "mdsmirror";
import Fuse from 'fuse.js';
import { store } from 'lib/store';
import { Note } from 'types/model';
import { loadDir } from 'file/open';
import { checkFileIsMd } from 'file/process';

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
      : notesArr.filter(n => !n.is_dir && checkFileIsMd(n.id));
    
    return allNotes;
  }, [searchDir]);

  const search = useCallback(
    (searchText: string) => {
      const fuse = initFuse(
        notesBase.length > 0 ? notesBase : myNotes(),
        searchContent,
        searchHashTag,
        extendedSearch
      );
      return fuse.search(searchText.trim(), { limit: numOfResults });
    },
    [notesBase, myNotes, searchContent, searchHashTag, extendedSearch, numOfResults]
  );
  return search;
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
