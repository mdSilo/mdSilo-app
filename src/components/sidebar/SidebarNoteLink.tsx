import {
  ForwardedRef,
  forwardRef,
  HTMLAttributes,
  memo,
  useCallback,
  useMemo,
} from 'react';
import { IconCaretRight, IconNotes } from '@tabler/icons';
import { useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import Tooltip from 'components/misc/Tooltip';
import { listDir } from 'file/open';
import SidebarItem from './SidebarItem';
import SidebarNoteLinkDropdown from './SidebarNoteLinkDropdown';
import { FlattenedNoteTreeItem } from './SidebarNotesTree';

interface Props extends HTMLAttributes<HTMLDivElement> {
  node: FlattenedNoteTreeItem;
  isHighlighted?: boolean;
}

const SidebarNoteLink = (
  props: Props,
  forwardedRef: ForwardedRef<HTMLDivElement>
) => {
  const { node, isHighlighted, className = '', style, ...otherProps } = props;
  // console.log("node", node)
  const currentDir = useStore((state) => state.currentDir);
  const note = useStore((state) => state.notes[node.id]);
  // console.log("note", note)
  const filePath = note?.file_path;
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick();
  const toggleNoteTreeItemCollapsed = useStore(
    (state) => state.toggleNoteTreeItemCollapsed
  );
  const onArrowClick = useCallback(
    () => toggleNoteTreeItemCollapsed(node.id),
    [node, toggleNoteTreeItemCollapsed]
  );
  // add 16px for every level of nesting, plus 8px base padding
  const leftPadding = useMemo(() => node.depth * 16 + 8, [node.depth]);

  return (
    <SidebarItem
      ref={forwardedRef}
      className={`relative flex items-center justify-between overflow-x-hidden group focus:outline-none ${className}`}
      isHighlighted={isHighlighted}
      style={style}
      {...otherProps}
    >
      <div
        role="button"
        className="flex items-center flex-1 px-2 py-1 overflow-hidden select-none overflow-ellipsis whitespace-nowrap"
        onClick={async (e) => {
          e.preventDefault();
          if (note?.is_dir) return;
          onNoteLinkClick(note.id, note);
          if (isMobile()) {
            setIsSidebarOpen(false);
          }
        }}
        style={{ paddingLeft: `${leftPadding}px` }}
        draggable={false}
      >
        {note?.is_dir ? (
          <button
            className="p-1 mr-1 rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500"
            onClick={async(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (node.collapsed) {
                await listDir(note.file_path);
              }
              onArrowClick?.();
            }}
          >
            <IconCaretRight
              className={`flex-shrink-0 text-gray-500 dark:text-gray-100 transform transition-transform ${
                !node.collapsed ? 'rotate-90' : ''
              }`}
              size={16}
              fill="currentColor"
            />
          </button>
        ) : (
          <div
            className="p-1 mr-1 rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500"
          >
            <IconNotes 
              className="flex-shrink-0 text-gray-500 dark:text-gray-100"
              size={16}
            />
          </div>
        )}
        <Tooltip content={filePath} disabled={!currentDir || !filePath}>
          <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
            {note?.title}
          </span>
        </Tooltip>
      </div>
      {note?.is_dir ? null : (
        <SidebarNoteLinkDropdown
          note={note}
          className="opacity-0.1 group-hover:opacity-100"
        />
      )}
    </SidebarItem>
  );
};

export default memo(forwardRef(SidebarNoteLink));
