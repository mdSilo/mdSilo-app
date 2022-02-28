import {
  ForwardedRef,
  forwardRef,
  HTMLAttributes,
  memo,
  useCallback,
  useMemo,
} from 'react';
import { IconCaretRight } from '@tabler/icons';
import { useStore } from 'lib/store';
import { Note } from 'types/model';
import { isMobile } from 'utils/helper';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { openFile } from 'file/open';
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

  const note = useStore((state) => state.notes[node.id]);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const lastOpenNoteId = useStore(
    (state) => state.openNoteIds[state.openNoteIds.length - 1]
  );

  // Q: it is better to put this func here or useOnNoteLinkClick?
  const openFileAndGetNoteId = async (note: Note) => {
    const filePath = note.file_path;
    const noteId = note.id;

    if (note.not_process && filePath) {
      await openFile([filePath]);
    }
  
    return noteId;
  }

  const { onClick: onNoteLinkClick } = useOnNoteLinkClick(lastOpenNoteId);

  const toggleNoteTreeItemCollapsed = useStore(
    (state) => state.toggleNoteTreeItemCollapsed
  );

  const onArrowClick = useCallback(
    () => toggleNoteTreeItemCollapsed(node.id),
    [node, toggleNoteTreeItemCollapsed]
  );

  // We add 16px for every level of nesting, plus 8px base padding
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
          const noteId = await openFileAndGetNoteId(note);
          if (!noteId) return;
          onNoteLinkClick(noteId, e.shiftKey);
          if (isMobile()) {
            setIsSidebarOpen(false);
          }
        }}
        style={{ paddingLeft: `${leftPadding}px` }}
        draggable={false}
      >
        <button
          className="p-1 mr-1 rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
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
        <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
          {note.title}
        </span>
      </div>
      <SidebarNoteLinkDropdown
        note={note}
        className="opacity-0.1 group-hover:opacity-100"
      />
    </SidebarItem>
  );
};

export default memo(forwardRef(SidebarNoteLink));
