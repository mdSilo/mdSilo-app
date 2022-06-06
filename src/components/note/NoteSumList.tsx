import { IconPencil } from '@tabler/icons';
import MsEditor, { parser, serializer } from "mdsmirror";
import { useCurrentViewContext } from 'context/useCurrentView';
import { Note } from 'types/model';
import { useStore } from 'lib/store';
import Tree from 'components/misc/Tree';
import Tooltip from 'components/misc/Tooltip';
import { openFileAndGetNoteId } from 'editor/hooks/useOnNoteLinkClick';

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
      children: notes.filter(n => !n.is_dir).map(noteToTreeData()),
    }
  ];

  const collapseAll = false;

  return (
    <Tree data={nodeData} className={className} collapseAll={collapseAll} />
  );
}

// eslint-disable-next-line react/display-name
const noteToTreeData = () => (note: Note) => {
  const doc = parser.parse(note.content);
  const value = doc.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((node: any) => node.type.name === 'paragraph')
    .slice(0, 2);
  const sum: string = serializer.serialize(value);
  
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const darkMode = useStore((state) => state.darkMode);
  
  return {
    id: note.id,
    labelNode: (
      <div className="flex flex-col w-full mx-auto overlfow-y-auto">
        <button 
          className="link flex items-center py-2" 
          onClick={async () => {
            const noteId = await openFileAndGetNoteId(note);
            dispatch({view: 'md', params: {noteId}});
          }}
        >
          <span className="text-2xl font-semibold overflow-x-hidden overflow-ellipsis whitespace-nowrap">
            {note.title}
          </span>
        </button>
        <MsEditor value={sum} dark={darkMode} readOnly={true} />
      </div>
    ),
    showArrow: false,
  };
};
