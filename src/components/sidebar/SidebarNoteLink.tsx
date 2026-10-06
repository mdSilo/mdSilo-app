import {
  ForwardedRef,
  forwardRef,
  HTMLAttributes,
  memo,
  useCallback,
} from 'react';
import { TbCaretRight as IconCaretRight, TbMarkdown as IconMarkdown, TbNote as IconNote, TbPhoto as IconPhoto } from 'react-icons/tb';
import { NoteTreeItem, store, useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import { imageExtensions } from 'utils/file-extensions';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import Tooltip from 'components/misc/Tooltip';
import { checkFileIsMd, getFileExt } from 'file/process';
import { listDir, openUrl } from 'file/open';
import { normalizeSlash } from 'file/util';
import SidebarItem from './SidebarItem';
import { SidebarDirDropdown, SidebarNoteDropdown } from './SidebarDropdown';

interface Props extends HTMLAttributes<HTMLDivElement> {
  node: NoteTreeItem;
  isHighlighted?: boolean;
  depth?: number;
  isExpanded?: boolean;
}

const SidebarNoteLink = (
  props: Props,
  forwardedRef: ForwardedRef<HTMLDivElement>
) => {
  const {
    node, isHighlighted, depth = 0, isExpanded = false, className = '', style, ...otherProps
  } = props;
  // console.log("node: ", node)
  const filePath = node.id;
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const toggleExpandedDir = useStore((state) => state.toggleExpandedDir);
  // console.log("isLoading", isLoading, node.id);
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick();
  const isDir = node.is_dir; 
  const isNonMd = !isDir && !checkFileIsMd(node.id);
  const isImage = imageExtensions.includes(getFileExt(node.id).toLowerCase());
  const onClickFile = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    // console.log("click, isLoading", isLoading, node.id);
    if (isDir) {
      // expand or collapse in place, load the sub dir lazily
      const dirPath = normalizeSlash(node.id);
      if (!isExpanded && !store.getState().noteTree[dirPath]) {
        await listDir(dirPath, false);
      }
      toggleExpandedDir(dirPath, !isExpanded);
      return;
    } else if (isNonMd) {
      await openUrl(node.id)
    } else {
      await onNoteLinkClick(node.id);
    }
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
  }, [isDir, isExpanded, isNonMd, node.id, onNoteLinkClick, setIsSidebarOpen, toggleExpandedDir]);
  
  // add 16px for every level of nesting, plus 8px base padding
  const leftPadding = depth * 16 + 8;

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
        <div className="p-1 mr-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600">
          {isDir ? (
            <IconCaretRight
              className={`flex-shrink-0 text-gray-500 dark:text-gray-100 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              size={16}
              fill="currentColor"
            />
          ) : isImage ? (
            <IconPhoto 
              className="flex-shrink-0 text-gray-500 dark:text-gray-100"
              size={16} 
              color="orange"
            />
          ) : !isNonMd ? (
            <IconMarkdown 
              className="flex-shrink-0 text-gray-500 dark:text-gray-100"
              size={16}
              color="green"
            />
          ) : (
            <IconNote 
              className="flex-shrink-0 text-gray-500 dark:text-gray-100"
              size={16}
              color="purple"
            />
          )}
        </div>
        <Tooltip content={filePath} disabled={!filePath}>
          <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
            {node.title}
          </span>
        </Tooltip>
      </div>
      {isDir ? (
        <SidebarDirDropdown
          dirPath={node.id}
          className="opacity-0.1 group-hover:opacity-100"
        />
      ) : !isNonMd ? (
        <SidebarNoteDropdown
          noteId={node.id}
          className="opacity-0.1 group-hover:opacity-100"
        />
      ) : null}
    </SidebarItem>
  );
};

export default memo(forwardRef(SidebarNoteLink));
