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
import { listDirPath } from 'editor/hooks/useOpen';
import SidebarItem from './SidebarItem';
import { SidebarDirDropdown, SidebarNoteDropdown } from './SidebarDropdown';
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
  // console.log("node: ", node)
  const filePath = node.id;
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  // console.log("isLoading", isLoading, node.id);
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick(); 
  const onClickFile = useCallback(async (e) => {
    e.preventDefault();
    // console.log("click, isLoading", isLoading, node.id);
    if (node.isDir) {
      await listDirPath(node.id, false);
    } else {
      await onNoteLinkClick(node.id);
    }
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
  }, [node, onNoteLinkClick, setIsSidebarOpen])
  
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
        onClick={onClickFile}
        style={{ paddingLeft: `${leftPadding}px` }}
        draggable={false}
      >
        <div
          className="p-1 mr-1 rounded hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-600 dark:active:bg-gray-500"
        >
          {node.isDir ? (
            <IconCaretRight
              className={`flex-shrink-0 text-gray-500 dark:text-gray-100 transform transition-transform ${!node.collapsed ? 'rotate-90' : ''}`}
              size={16}
              fill="currentColor"
            />
          ) : (
            <IconNotes 
              className="flex-shrink-0 text-gray-500 dark:text-gray-100"
              size={16}
            />
          )}
        </div>
        <Tooltip content={filePath} disabled={!filePath}>
          <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
            {node.title}
          </span>
        </Tooltip>
      </div>
      {node.isDir ? (
        <SidebarDirDropdown
          dirPath={node.id}
          className="opacity-0.1 group-hover:opacity-100"
        />
      ) : (
        <SidebarNoteDropdown
          noteId={node.id}
          className="opacity-0.1 group-hover:opacity-100"
        />
      )}
    </SidebarItem>
  );
};

export default memo(forwardRef(SidebarNoteLink));
