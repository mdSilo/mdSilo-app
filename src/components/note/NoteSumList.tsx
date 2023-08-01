import { IconPencil } from '@tabler/icons-react';
import { parser, serializer } from "mdsmirror";
import { useCurrentViewContext, DispatchType } from 'context/useCurrentView';
import { Note } from 'types/model';
import Tree from 'components/misc/Tree';
import Tooltip from 'components/misc/Tooltip';
import { openFilePath } from 'file/open';

type Props = {
  anchor: string;
  notes: Note[];
  className?: string;
  isDate?: boolean;
  onClick?: (anchor: string) => void;
};

export default function NoteSumList(props: Props) {
  const { anchor, notes, className, isDate, onClick } = props;
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

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
      children: notes.map(noteToTreeData(dispatch)),
    }
  ];

  const collapseAll = false;

  return (
    <Tree data={nodeData} className={className} collapseAll={collapseAll} />
  );
}

// eslint-disable-next-line react/display-name
const noteToTreeData = (dispatch: DispatchType) => (note: Note) => {
  const doc = parser.parse(note.content);
  const value = doc.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((node: any) => node.type.name === 'paragraph')
    .slice(0, 2);
  const sum: string = serializer.serialize(value);
  
  return {
    id: note.id,
    labelNode: (
      <div className="flex flex-col w-full mx-auto overlfow-y-auto">
        <button 
          className="link flex items-center py-2" 
          onClick={async () => {
            await openFilePath(note.id, true);
            dispatch({view: 'md', params: { noteId: note.id }});
          }}
        >
          <span className="text-2xl font-semibold overflow-x-hidden overflow-ellipsis whitespace-nowrap">
            {note.title}
          </span>
        </button>
        <div>{sum}</div>
      </div>
    ),
    showArrow: false,
  };
};
