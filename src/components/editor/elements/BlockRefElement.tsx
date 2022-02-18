import { ReactNode, useCallback, useMemo } from 'react';
import { Node } from 'slate';
import { RenderElementProps, useFocused, useSelected } from 'slate-react';
import classNames from 'classnames';
import { BlockReference, ElementType } from 'editor/slate';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useStore } from 'lib/store';
import Tooltip from 'components/misc/Tooltip';
import useBlockReference from 'editor/backlinks/useBlockReference';
import { useCurrentContext } from 'editor/hooks/useCurrent';
import ReadOnlyEditor from '../ReadOnlyEditor';
import ParagraphElement from './ParagraphElement';
import EditorElement, { EditorElementProps } from './EditorElement';

type BlockRefElementProps = {
  element: BlockReference;
  children: ReactNode;
  attributes: RenderElementProps['attributes'];
  className?: string;
};

export default function BlockRefElement(props: BlockRefElementProps) {
  const { className = '', element, children, attributes } = props;
  const selected = useSelected();
  const focused = useFocused();

  const blockReference = useBlockReference(element.blockId);
  const currentNote = useCurrentContext();
  const { onClick: onBlockRefClick, defaultStackingBehavior } =
    useOnNoteLinkClick(currentNote.id);

  const blockRefClassName = classNames(
    'p-2 border-b border-l-2 border-gray-200 select-none cursor-alias hover:bg-gray-200 active:bg-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 dark:active:bg-gray-800',
    { 'bg-gray-100 dark:bg-gray-500': selected && focused },
    className
  );

  const noteTitle = useStore((state) =>
    blockReference ? state.notes[blockReference.noteId]?.title : null
  );

  const renderElement = useCallback((props: EditorElementProps) => {
    const elementType = props.element.type;
    if (elementType === ElementType.ListItem) {
      return <ParagraphElement {...props} />;
    } else {
      return <EditorElement {...props} />;
    }
  }, []);

  const editorValue = useMemo(
    () => (blockReference ? [blockReference.element] : []),
    [blockReference]
  );

  return (
    <Tooltip content={noteTitle} placement="bottom-start" disabled={!noteTitle}>
      <div
        className={blockRefClassName}
        onClick={(e) => {
          e.stopPropagation();
          if (blockReference) {
            onBlockRefClick(
              blockReference.noteId,
              defaultStackingBehavior(e),
              blockReference.path
            );
          }
        }}
        {...attributes}
      >
        {blockReference ? (
          <ReadOnlyEditor
            value={editorValue}
            renderElement={renderElement}
          />
        ) : (
          <BlockRefError element={element} />
        )}
        {children}
      </div>
    </Tooltip>
  );
}

type BlockRefErrorProps = {
  element: BlockReference;
};

const BlockRefError = (props: BlockRefErrorProps) => {
  const { element } = props;
  return (
    <div className="font-medium text-red-500" contentEditable={false}>
      <div>
        Error: no block with id &ldquo;{element.blockId}
        &rdquo;.
      </div>
      <div>Last saved content: {Node.string(element)}</div>
    </div>
  );
};
