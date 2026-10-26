import { TbPencil as IconPencil } from 'react-icons/tb';
import { parser, serializer } from "mdsmirror";
import { useCurrentViewContext, DispatchType } from 'context/useCurrentView';
import { Note } from 'types/model';
import Tree from 'components/misc/Tree';
import Tooltip from 'components/misc/Tooltip';
import { openFilePath } from 'file/open';
import { useNoteContent } from 'lib/contentCache';

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
        <div className="flex w-full mt-2 p-1 bg-base-200">
          <span className="py-1 text-xl text-base-content">{anchor}</span>
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

/** The first paragraphs of a note, as markdown. */
export function summaryOf(content: string): string {
  const doc = parser.parse(content);
  const value = doc.content.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((node: any) => node.type.name === 'paragraph')
    .slice(0, 2);
  return serializer.serialize(value);
}

/** The summary of a note, its content read on use (see Note.parsed). */
function NoteSum({ note }: { note: Note }) {
  const content = useNoteContent(note);
  return <div>{content ? summaryOf(content) : ''}</div>;
}

const noteToTreeData = (dispatch: DispatchType) => (note: Note) => {
  return {
    id: note.id,
    labelNode: (
      <div className="flex flex-col w-full mx-auto overlfow-y-auto">
        <button 
          className="ms-link flex items-center py-2" 
          onClick={async () => {
            await openFilePath(note.id, true);
            dispatch({view: 'md', params: { noteId: note.id }});
          }}
        >
          <span className="text-2xl font-semibold overflow-x-hidden text-ellipsis whitespace-nowrap">
            {note.title}
          </span>
        </button>
        <NoteSum note={note} />
      </div>
    ),
    showArrow: false,
  };
};
