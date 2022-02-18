import { useCallback } from 'react';
import Fuse from 'fuse.js';
import { createEditor, Descendant, Editor, Node, Path } from 'slate';
import { store } from 'lib/store';
import { Note } from 'types/model';
import withLinks from 'editor/plugins/withLinks';
import withTags from 'editor/plugins/withTags';
import withVoidElements from 'editor/plugins/withVoidElements';

export type NoteBlock = { text: string; path: Path };

type FuseDatum = {
  id: string;
  title: string;
  update_at: string;
  blocks?: NoteBlock[];
};

type searchOptions = {
  numOfResults?: number;
  searchContent?: boolean;
  extendedSearch?: boolean;
  searchWiki?: boolean;
  notesBase?: Note[];
};

// search Notes per kw or hashtag
export default function useNoteSearch({
  numOfResults = -1,
  searchContent = false,
  extendedSearch = false,
  searchWiki = false,
  notesBase = [],
}: searchOptions = {}) {
  const myNotes = useCallback(() => {
    const notes = store.getState().notes;
    const notesArr = Object.values(notes);
    const allNotes = searchWiki 
      ? notesArr.filter(n => n.is_wiki) 
      : notesArr.filter(n => !n.is_wiki);
    return allNotes;
  }, [searchWiki]);

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
      update_at: note.updated_at,
      ...(searchContent ? { blocks: flattenContent(note.content) } : {}),
    })
  );
};

// Flatten the content into individual lines
const flattenContent = (content: Descendant[]): NoteBlock[] => {
  const editor = withVoidElements(withTags(withLinks(createEditor())));
  editor.children = content;

  const blocks = Editor.nodes(editor, {
    at: [],
    match: (n) => !Editor.isEditor(n) && Editor.isBlock(editor, n),
    mode: 'lowest',
  });

  const result = [];
  for (const [node, path] of blocks) {
    const blockText = Node.string(node);
    result.push({ text: blockText, path });
  }
  return result;
};
