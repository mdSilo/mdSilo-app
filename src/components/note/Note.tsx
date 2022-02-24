import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { Path, Descendant } from 'slate';
import { toast } from 'react-toastify';
import Editor from 'components/editor/Editor';
import Title from 'components/editor/Title';
import Backlinks from 'components/editor/backlinks/Backlinks';
import { store, useStore } from 'lib/store';
import type { Note as NoteType } from 'types/model';
import serialize from 'editor/serialization/serialize';
import { getDefaultEditorValue, defaultDemoNote } from 'editor/constants';
import { useCurrentViewContext } from 'context/useCurrentView';
import { ProvideCurrentMd } from 'context/useCurrentMd';
import updateBacklinks from 'editor/backlinks/updateBacklinks';
import { ciStringEqual } from 'utils/helper';
import { writeFile, writeJsonFile, deleteFile } from 'file/write';
import { joinPath } from 'file/util';
import ErrorBoundary from '../misc/ErrorBoundary';
import NoteHeader from './NoteHeader';

type Props = {
  noteId: string;
  highlightedPath?: Path;
  className?: string;
};

function Note(props: Props) {
  const { noteId, highlightedPath, className } = props;
  const updateNote = useStore((state) => state.updateNote);
  const parentDir = store.getState().currentDir;
  console.log("current dir", parentDir);
  // get some property of note
  const isPub = store.getState().notes[noteId]?.is_pub ?? false;
  const isDaily = store.getState().notes[noteId]?.is_daily ?? false;
  const initIsWiki = store.getState().notes[noteId]?.is_wiki ?? false;
  const [isWiki, setIsWiki] = useState(initIsWiki);
  const [isLoaded, setIsLoaded] = useState(false)  // for clean up in useEffect

  
  // load note if it isWiki
  // TODO, network request
  const loadNote = async (noteId: string) => {
    const note: NoteType = defaultDemoNote;
    if (note) {
      store.getState().upsertNote(note);
      setIsWiki(note.is_wiki);
    }
  };

  useEffect(() => { 
    if (isWiki && !isLoaded) {
      loadNote(noteId);
    }
    return () => {
      setIsLoaded(true);
    }
  }, [noteId, isWiki, isLoaded]);

  // get title and content value
  const title = store.getState().notes[noteId]?.title ?? 'demo note';
  const [initTitle, ] = useState(title); // an initial title copy
  const value = useStore(
    (state) => state.notes[noteId]?.content ?? getDefaultEditorValue()
  );

  // update locally
  const onValueChange = useCallback(
    async (value: Descendant[]) => {
      updateNote({ id: noteId, content: value });
      // write to local file
      //const parentDir = store.getState().currentDir;
      if (parentDir) {
        const notePath = joinPath(parentDir, `${title}.md`);
        const content = value.map((n) => serialize(n)).join('');
        await writeFile(notePath, content);
        await writeJsonFile(parentDir);
      }
    },
    [noteId, parentDir, title, updateNote]
  );

  // update locally, set the syncState
  const onTitleChange = useCallback(
    async (title: string) => {
      // update note title in storage as unique title
      const newTitle = title.trim() || getUntitledTitle(noteId);
      const isTitleUnique = () => {
        const notesArr = Object.values(store.getState().notes);
        return notesArr.findIndex(
          // no need to be unique for wiki note title
          (n) => n.id !== noteId && !n.is_wiki && ciStringEqual(n.title, newTitle)
        ) === -1;
      };
      if (isWiki || isTitleUnique()) {
        updateNote({ id: noteId, title: newTitle });
        await updateBacklinks(newTitle, noteId); 
        // write to local file
        if (!isWiki && parentDir) {
          // on rename file: 
          // const parentDir = store.getState().currentDir;
          // 1- new FilePath
          const newPath = joinPath(parentDir, `${newTitle}.md`);
          // 2- swap value
          const content = value.map((n) => serialize(n)).join('');
          await writeFile(newPath, content);
          await writeJsonFile(parentDir);
          // 3- delete the old redundant File
          await deleteFile(joinPath(parentDir, `${initTitle}.md`));
        }
      } else {
        toast.error(
          `There's already a note called ${newTitle}. Please use a different title.`
        );
      }
    },
    [noteId, isWiki, updateNote, parentDir, value, initTitle]
  );

  // TODO: update wiki note to db
  // TODO: Prompt the usr with a dialog box about unsaved changes if they navigate away

  const noteContainerClassName =
    'flex flex-col flex-shrink-0 md:flex-shrink w-full bg-white dark:bg-gray-800 dark:text-gray-200';
  const errorContainerClassName = 
    `${noteContainerClassName} items-center justify-center h-full p-4`;

  // for context 
  const currentView = useCurrentViewContext();
  const state = currentView.state;
  const dispatch = currentView.dispatch;
  const currentNoteValue = useMemo(() => (
    { ty: 'note', id: noteId, state, dispatch }
  ), [dispatch, noteId, state]);

  const isNoteExists = useMemo(() => !!store.getState().notes[noteId], [noteId]);

  if (!isNoteExists) {
    return (
      <div className={errorContainerClassName}>
        <p>it does not look like this note exists! {noteId}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className={errorContainerClassName}>
          <p>An unexpected error occurred when rendering this note.</p>
        </div>
      }
    >
      <ProvideCurrentMd value={currentNoteValue}>
        <div id={noteId} className={`${noteContainerClassName} ${className}`}>
          <NoteHeader isWiki={isWiki} isPub={isPub} />
          <div className="flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col flex-1 w-full mx-auto md:w-128 lg:w-160 xl:w-192">
              <Title
                className="px-8 pb-1 md:px-12"
                initialTitle={title}
                onChange={onTitleChange}
                isDaily={isDaily}
                isPub={isPub}
              />
              <Editor
                className="flex-1 px-8 pt-2 pb-8 md:pb-12 md:px-12"
                noteId={noteId}
                value={value}
                onChange={onValueChange}
                highlightedPath={highlightedPath}
                isWiki={isWiki}
                isDaily={isDaily}
                isPub={isPub}
              />
              <div className="pt-2 border-t-2 border-gray-200 dark:border-gray-600">
                <Backlinks className="mx-4 mb-8 md:mx-8 md:mb-12" isCollapse={isWiki} />
              </div>
            </div>
          </div>
        </div>
      </ProvideCurrentMd>
    </ErrorBoundary>
  );
}

export default memo(Note);

// Get a unique "Untitled" title, ignoring the specified noteId.
const getUntitledTitle = (noteId: string) => {
  const title = 'Untitled';

  const getResult = () => (suffix > 0 ? `${title} ${suffix}` : title);

  let suffix = 0;
  const notesArr = Object.values(store.getState().notes);
  while (
    notesArr.findIndex(
      (note) =>
        note.id !== noteId &&
        !note.is_wiki && 
        ciStringEqual(note.title, getResult())
    ) > -1
  ) {
    suffix += 1;
  }

  return getResult();
};
