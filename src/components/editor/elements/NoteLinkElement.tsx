import { ReactNode } from 'react';
import { RenderElementProps, useFocused, useSelected } from 'slate-react';
import classNames from 'classnames';
import { NoteLink } from 'editor/slate';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import Tooltip from 'components/misc/Tooltip';
import { useCurrentContext } from 'editor/hooks/useCurrent';
import { store } from 'lib/store';
import { extractTexts } from 'editor/hooks/useSummary';
import { refreshFile } from 'editor/hooks/useRefresh';

type NoteLinkElementProps = {
  element: NoteLink;
  children: ReactNode;
  attributes: RenderElementProps['attributes'];
  className?: string;
};

export default function NoteLinkElement(props: NoteLinkElementProps) {
  const { className, element, children, attributes } = props;

  const currentNote = useCurrentContext();
  const { onClick: onNoteLinkClick, defaultStackingBehavior } =
    useOnNoteLinkClick(currentNote.id);

  const selected = useSelected();
  const focused = useFocused();
  const noteLinkClassName = classNames(
    'p-0.5 rounded cursor-pointer select-none border-b border-gray-200 text-primary-500  hover:bg-gray-100 active:bg-gray-200 dark:border-gray-700 dark:hover:bg-gray-800 dark:active:bg-gray-700',
    { 'bg-primary-100 dark:bg-primary-900': selected && focused },
    className
  );

  const noteId = element.noteId;
  const toNote = store.getState().notes[noteId];
  const content = toNote 
    ? extractTexts(toNote.content, 2) || element.noteTitle 
    : element.noteTitle || 'To Linked Note';
  // FSA: refresh file to sync any modification by external editor
  const refreshOnClick = async () => await refreshFile(toNote.title);

  return (
    <Tooltip content={content} placement="bottom-start">
      <span
        role="button"
        className={noteLinkClassName}
        onClick={async (e) => {
          e.stopPropagation();
          await refreshOnClick();
          onNoteLinkClick(noteId, defaultStackingBehavior(e));
        }}
        contentEditable={false}
        {...attributes}
      >
        {element.customText ?? element.noteTitle}
        {children}
      </span>
    </Tooltip>
  );
}
