// import { Descendant } from 'slate';
import { IconPencil } from '@tabler/icons';
import { useCurrentViewContext } from 'context/useCurrentView';
import { Note } from 'types/model';
import Tree from 'components/misc/Tree';
import Tooltip from 'components/misc/Tooltip';
import useSummary from 'editor/hooks/useSummary';
import ReadOnlyEditor from 'components/editor/ReadOnlyEditor';

type Props = {
  anchor: string;
  notes: Note[];
  className?: string;
  isDate?: boolean;
  onClick?: (anchor: string) => void;
};

export default function NoteSumList(props: Props) {
  const { anchor, notes, className, isDate, onClick } = props;
  const nodeData = [
    {
      id: anchor,
      labelNode: (
        <div className="flex w-full mt-2 p-1 bg-gray-100 dark:bg-gray-800">
          <span className="py-1 text-xl text-gray-800 dark:text-gray-100">{anchor}</span>
          {isDate ? (
            <Tooltip content={`Recap: ${anchor}`}>
              <button className="px-2" onClick={onClick ? () => onClick(anchor) : undefined}>
                <IconPencil size={16} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      ),
      children: notes.map(noteToTreeData()),
    }
  ];

  const collapseAll = false;

  return (
    <Tree data={nodeData} className={className} collapseAll={collapseAll} />
  );
}

// eslint-disable-next-line react/display-name
const noteToTreeData = () => (note: Note) => {
  const summary = useSummary(note.content);
  const value = summary.slice(0, 2);

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  
  return {
    id: note.id,
    labelNode: (
      <div className="flex flex-col w-full mx-auto overlfow-y-auto">
        <button 
          className="title link flex items-center text-lg py-2" 
          onClick={() => dispatch({view: 'md', params: {noteId: note.id}})}
        >
          <span className="text-lg overflow-x-hidden overflow-ellipsis whitespace-nowrap">
            {note.title}
          </span>
        </button>
        <ReadOnlyEditor value={value} />
      </div>
    ),
    showArrow: false,
  };
};
