import { useState, useCallback } from 'react';
import { useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import FindOrCreateInput from 'components/note/NoteNewInput';
import { matchSort, SearchLeaf } from 'components/sidebar/SidebarSearch';
import Tree from 'components/misc/Tree';
import useNoteSearch from 'editor/hooks/useNoteSearch';
import { dateCompare, getStrDate } from 'utils/helper';

export default function Tasks() {
  const currentDir = useStore((state) => state.currentDir);
  const notes = useStore((state) => state.notes);
  const notesArr = Object.values(notes);
  const myNotes = notesArr.filter(n => !n.is_wiki);
  myNotes.sort((n1, n2) => dateCompare(n2.updated_at, n1.updated_at));

  const [collapseIds, setCollapseIds] = useState<string[]>([]);
  const onClose = useCallback(
    (ids: string[]) => setCollapseIds(ids), []
  );

  const search = useNoteSearch({ searchContent: true, extendedSearch: true });
  const getTaskNotes = (searchQuery: string) => {
    const searchResults = search(searchQuery);
    return searchResults.map((result, index) => ({
      id: `${result.item.id}-${index}`,
      labelNode: (
        <p className="py-1 mt-2 text-sm overflow-hidden overflow-ellipsis whitespace-nowrap dark:text-gray-200">
          {`${getStrDate(result.item.update_at)} : ${result.item.title}`}
        </p>
      ),
      showArrow: false,
      children: result.matches
        ? [...result.matches].sort(matchSort).map((match, index) => ({
            id: `${result.item.id}-${index}`,
            labelNode: (
              <SearchLeaf
                noteId={result.item.id}
                text={match.value ?? ''}
                searchQuery={searchQuery}
                block={
                  result.item.blocks && match.refIndex !== undefined
                    ? result.item.blocks[match.refIndex]
                    : undefined
                }
                className={getTaskClass(searchQuery)}
              />
            ),
            showArrow: false,
            toIndent: false,
          }))
        : undefined,
    }))
  };


  const taskDivClass = 'flex mt-1 p-1 rounded';
  const tasks = [
    {
      id: 'doing',
      labelNode: (
        <div className={taskDivClass}>
          <b className="py-1 text-xl">Doing</b>
        </div>
      ),
      children: [], // TODO getTaskNotes('#doing'),
    },
    {
      id: 'todo',
      labelNode: (
        <div className={taskDivClass}>
          <b className="py-1 text-xl">To Do</b>
        </div>
      ),
      children: [], // TODO getTaskNotes('#todo'),
    },
    {
      id: 'done',
      labelNode: (
        <div className={taskDivClass}>
          <b className="py-1 text-xl">Done</b>
        </div>
      ),
      children: [], // TODO getTaskNotes('#done'),
    },
  ];

  return (
    <>
      <ErrorBoundary>
        <div className="flex flex-1 flex-col flex-shrink-0 md:flex-shrink p-6 w-full mx-auto md:w-128 lg:w-160 xl:w-192 bg-white dark:bg-gray-800 dark:text-gray-200 overlfow-y-auto">
          <div className="flex justify-center my-6">
            {currentDir ? (
              <FindOrCreateInput
                className="w-full bg-white rounded shadow-popover dark:bg-gray-800"
              />) : null
            }
          </div>
          <div className="flex my-1 p-1 rounded">
            <button className="text-red-500 pr-1" onClick={() => onClose(['done','todo'])}>
              #doing
            </button>  
            <button className="text-blue-500 pr-1" onClick={() => onClose(['done','doing'])}>
              #todo
            </button>
            <button className="text-green-500 pr-1" onClick={() => onClose(['doing','todo'])}>
              #done
            </button>
          </div>
          <div className="overlfow-y-auto">
            <Tree data={tasks} className={""} collapseAll={false} collapseIds={collapseIds} />
          </div>
        </div>
      </ErrorBoundary>
    </>
  );
}

const getTaskClass = (taskTag: string) => {
  const tagClass = 'link bg-gray-200 dark:bg-gray-700 px-2 border-l-2';
  switch (taskTag) {
    case '#todo':
      return `${tagClass} border-blue-600`;
    case '#done':
      return `${tagClass} border-green-600`; 
    case '#doing':
      return `${tagClass} border-red-600`;
    default:
      return tagClass;
  }
}
