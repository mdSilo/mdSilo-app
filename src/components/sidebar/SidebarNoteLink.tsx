import {
  ForwardedRef,
  forwardRef,
  HTMLAttributes,
  memo,
  useCallback,
} from 'react';
import {
  TbCaretRight as IconCaretRight, TbMarkdown as IconMarkdown, TbNote as IconNote, TbPhoto as IconPhoto,
} from 'react-icons/tb';
import { NoteTreeItem, store, useStore } from 'lib/store';
import { isMobile } from 'utils/helper';
import { imageExtensions } from 'utils/file-extensions';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { Tooltip } from 'components/misc/ui';
import { checkFileIsMd, getFileExt } from 'file/process';
import { listDir, openUrl } from 'file/open';
import { joinPath, normalizeSlash } from 'file/util';
import { READING_DIR, WRITING_DIR } from 'workspace/layout';
import { isBookFile } from 'reader/document';
import BookIcon, { bookIconOf } from 'reader/components/BookIcon';
import { bookPathOfAnnotations } from 'reader/annotations';
import { useCurrentViewContext } from 'context/useCurrentView';
import SidebarItem from './SidebarItem';
import { SidebarDirDropdown, SidebarNoteDropdown } from './SidebarDropdown';

// indent of each nesting level in the tree
export const INDENT_PER_LEVEL = 16;

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
  const { dispatch } = useCurrentViewContext();
  // a book of a workspace: read in the app
  const isBook = useStore((state) => state.layout === 'workspace') && isBookFile(node.id);
  const isDir = node.is_dir; 
  const isNonMd = !isDir && !checkFileIsMd(node.id);
  const isImage = imageExtensions.includes(getFileExt(node.id).toLowerCase());
  // reading/ and writing/ of a workspace: the two roots of the tree
  const rootLabel = useStore((state) => {
    if (!isDir || depth !== 0 || state.layout !== 'workspace' || !state.initDir) return '';
    const id = normalizeSlash(node.id);
    if (id === joinPath(state.initDir, READING_DIR)) return 'Reading';
    if (id === joinPath(state.initDir, WRITING_DIR)) return 'Writing';
    return '';
  });
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
    } else if (isBook) {
      dispatch({ view: 'book', path: node.id });
    } else if (isNonMd) {
      await openUrl(node.id)
    } else {
      await onNoteLinkClick(node.id);
    }
    if (isMobile()) {
      setIsSidebarOpen(false);
    }
  }, [
    dispatch, isBook, isDir, isExpanded, isNonMd, node.id, onNoteLinkClick, setIsSidebarOpen,
    toggleExpandedDir,
  ]);
  
  // add 16px for every level of nesting, plus 8px base padding
  const leftPadding = depth * INDENT_PER_LEVEL + 8;

  return (
    <SidebarItem
      ref={forwardedRef}
      className={`relative flex items-center justify-between overflow-x-visible! group focus:outline-hidden ${className}`}
      isHighlighted={isHighlighted}
      style={style}
      {...otherProps}
    >
      <div
        role="button"
        className="flex items-center flex-1 px-2 py-1 overflow-hidden select-none text-ellipsis whitespace-nowrap"
        onClick={onClickFile}
        style={{ paddingLeft: `${leftPadding}px` }}
        draggable={false}
      >
        <div className="p-1 mr-1 rounded-sm hover:bg-base-content/15">
          {isDir ? (
            <IconCaretRight
              className={`shrink-0 text-base-content/60 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              size={16}
              fill="currentColor"
            />
          ) : bookIconOf(node.id) ? (
            <BookIcon path={node.id} />
          ) : isImage ? (
            <IconPhoto 
              className="shrink-0 text-base-content/60"
              size={16} 
              color="orange"
            />
          ) : !isNonMd ? (
            <IconMarkdown 
              className="shrink-0 text-base-content/60"
              size={16}
              color="green"
            />
          ) : (
            <IconNote 
              className="shrink-0 text-base-content/60"
              size={16}
              color="purple"
            />
          )}
        </div>
        <Tooltip content={filePath} disabled={!filePath}>
          {rootLabel ? (
            <span className="text-xs font-semibold tracking-wider uppercase text-base-content/70">
              {rootLabel}
            </span>
          ) : (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {node.title}
              {/* the annotations of a book, named after it */}
              {!isDir && bookPathOfAnnotations(node.id) ? (
                <span className="ml-1 text-xs text-base-content/50">notes</span>
              ) : null}
            </span>
          )}
        </Tooltip>
      </div>
      {/* stick to the visible right edge when the tree scrolls horizontally */}
      <div className="sticky right-0 flex-none bg-inherit">
        {isDir ? (
          <SidebarDirDropdown
            dirPath={node.id}
            className="opacity-[0.001] group-hover:opacity-100"
          />
        ) : !isNonMd ? (
          <SidebarNoteDropdown
            noteId={node.id}
            className="opacity-[0.001] group-hover:opacity-100"
          />
        ) : null}
      </div>
    </SidebarItem>
  );
};

export default memo(forwardRef(SidebarNoteLink));
