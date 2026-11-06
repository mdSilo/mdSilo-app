import { memo, useCallback, useRef, useState } from "react";
import { Menu, MenuButton, MenuItems } from "@headlessui/react";
import {
  TbCornerDownRight as IconCornerDownRight,
  TbDots as IconDots,
  TbDotsDiagonal as IconDotsDiagonal,
  TbFolder as IconFolder,
  TbId as IconId,
  TbPlus as IconPlus,
} from "react-icons/tb";
import { usePopper } from "react-popper";
import { DropdownItem } from "@/ui/Dropdown";
import Portal from "@/ui/Portal";
import MoveToModal from "@/writer/NoteMoveModal";
import NoteMetadata from "@/writer/NoteMetadata";
import DirNewModal from "@/shell/dir/DirNewModal";
import { listDirPath } from "@/workspace/useOpen";
import { dirRenameOptions, noteRenameOptions } from "@/workspace/renamePath";
import { bookPathOfAnnotations } from "@/reader/annotations/annotations";
import { bookRenameOptions, moveBook } from "@/reader/library/bookFile";
import RenameModal from "./RenameModal";

type NoteProps = {
  noteId: string;
  className?: string;
};

const SidebarNoteLinkDropdown = (props: NoteProps) => {
  const { noteId, className } = props;

  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(
    containerRef.current,
    popperElement,
    { placement: "right-start" },
  );

  const [isMoveToModalOpen, setIsMoveToModalOpen] = useState(false);
  const onMoveToClick = useCallback(() => setIsMoveToModalOpen(true), []);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  // the notes of a book are moved and renamed with the book only
  const canMove = !bookPathOfAnnotations(noteId);

  return (
    <>
      <Menu>
        {({ open }) => (
          <>
            <MenuButton
              ref={containerRef}
              className={`rounded-sm hover:bg-base-content/15 active:bg-base-content/25 ${className}`}
            >
              <span className="flex items-center justify-center w-8 h-8">
                <IconDots className="text-base-content/70" />
              </span>
            </MenuButton>
            {open && (
              <Portal>
                <MenuItems
                  ref={setPopperElement}
                  className="z-20 w-56 overflow-hidden bg-base-200 rounded-sm shadow-popover focus:outline-hidden"
                  static
                  style={styles.popper}
                  {...attributes.popper}
                >
                  {canMove ? (
                    <>
                      <DropdownItem onClick={onMoveToClick}>
                        <IconCornerDownRight size={18} className="mr-1" />
                        <span>Move to</span>
                      </DropdownItem>
                      <DropdownItem onClick={() => setIsRenameModalOpen(true)}>
                        <IconId size={18} className="mr-1" />
                        <span>Rename</span>
                      </DropdownItem>
                    </>
                  ) : null}
                  <NoteMetadata noteId={noteId} />
                </MenuItems>
              </Portal>
            )}
          </>
        )}
      </Menu>
      {isMoveToModalOpen ? (
        <Portal>
          <MoveToModal noteId={noteId} setIsOpen={setIsMoveToModalOpen} />
        </Portal>
      ) : null}
      {isRenameModalOpen ? (
        <Portal>
          <RenameModal
            path={noteId}
            title="Rename the note"
            keepExt
            hint="The links to it by title are renamed with it."
            options={noteRenameOptions(noteId)}
            isOpen={isRenameModalOpen}
            handleClose={() => setIsRenameModalOpen(false)}
          />
        </Portal>
      ) : null}
    </>
  );
};

export const SidebarNoteDropdown = memo(SidebarNoteLinkDropdown);

type DirProps = {
  dirPath: string;
  className?: string;
  isOnBar?: boolean;
  menuBtn?: string;
};

const SidebarDirLinkDropdown = (props: DirProps) => {
  const { dirPath, className = "", isOnBar = false, menuBtn } = props;

  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(
    containerRef.current,
    popperElement,
    { placement: "right-start" },
  );

  const [isNewDirModalOpen, setIsNewDirModalOpen] = useState(false);
  const [isRenameDirModalOpen, setIsRenameDirModalOpen] = useState(false);

  const onNewDirClick = useCallback(() => {
    setIsNewDirModalOpen(true);
    setIsRenameDirModalOpen(false);
  }, []);

  const onRenameDirClick = useCallback(() => {
    setIsRenameDirModalOpen(true);
    setIsNewDirModalOpen(false);
  }, []);

  return (
    <>
      <Menu>
        {({ open }) => (
          <>
            <MenuButton
              ref={containerRef}
              className={`rounded-sm hover:bg-base-content/15 ${className}`}
            >
              {menuBtn ? (
                <span className="px-2 text-sm bg-secondary text-secondary-content rounded-sm overflow-hidden">
                  {menuBtn}
                </span>
              ) : (
                <span className="flex items-center justify-center w-8 h-8">
                  <IconDotsDiagonal className="text-base-content/70" />
                </span>
              )}
            </MenuButton>
            {open && (
              <Portal>
                <MenuItems
                  ref={setPopperElement}
                  className="z-20 w-56 overflow-hidden bg-base-200 rounded-sm shadow-popover focus:outline-hidden"
                  static
                  style={styles.popper}
                  {...attributes.popper}
                >
                  <DropdownItem onClick={onNewDirClick}>
                    <IconPlus size={18} className="mr-1" />
                    <span>New Subfolder</span>
                  </DropdownItem>
                  {isOnBar ? null : (
                    <>
                      <DropdownItem onClick={() => listDirPath(dirPath, false)}>
                        <IconFolder size={18} className="mr-1" />
                        <span>Open Folder Here</span>
                      </DropdownItem>
                      <DropdownItem onClick={onRenameDirClick}>
                        <IconId size={18} className="mr-1" />
                        <span>Rename</span>
                      </DropdownItem>
                    </>
                  )}
                </MenuItems>
              </Portal>
            )}
          </>
        )}
      </Menu>
      {isNewDirModalOpen ? (
        <Portal>
          <DirNewModal
            dirPath={dirPath}
            isOpen={isNewDirModalOpen}
            handleClose={() => setIsNewDirModalOpen(false)}
          />
        </Portal>
      ) : null}
      {isRenameDirModalOpen ? (
        <Portal>
          <RenameModal
            path={dirPath}
            title="Rename the folder"
            options={dirRenameOptions}
            isOpen={isRenameDirModalOpen}
            handleClose={() => setIsRenameDirModalOpen(false)}
          />
        </Portal>
      ) : null}
    </>
  );
};

export const SidebarDirDropdown = memo(SidebarDirLinkDropdown);

type BookProps = {
  bookPath: string;
  className?: string;
};

const SidebarBookLinkDropdown = (props: BookProps) => {
  const { bookPath, className } = props;

  const containerRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(
    containerRef.current,
    popperElement,
    { placement: "right-start" },
  );

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isMoveToModalOpen, setIsMoveToModalOpen] = useState(false);
  const onMove = useCallback(
    (tarDir: string) => moveBook(bookPath, tarDir),
    [bookPath],
  );

  return (
    <>
      <Menu>
        {({ open }) => (
          <>
            <MenuButton
              ref={containerRef}
              className={`rounded-sm hover:bg-base-content/15 active:bg-base-content/25 ${className}`}
            >
              <span className="flex items-center justify-center w-8 h-8">
                <IconDots className="text-base-content/70" />
              </span>
            </MenuButton>
            {open && (
              <Portal>
                <MenuItems
                  ref={setPopperElement}
                  className="z-20 w-56 overflow-hidden bg-base-200 rounded-sm shadow-popover focus:outline-hidden"
                  static
                  style={styles.popper}
                  {...attributes.popper}
                >
                  <DropdownItem onClick={() => setIsMoveToModalOpen(true)}>
                    <IconCornerDownRight size={18} className="mr-1" />
                    <span>Move to</span>
                  </DropdownItem>
                  <DropdownItem onClick={() => setIsRenameModalOpen(true)}>
                    <IconId size={18} className="mr-1" />
                    <span>Rename</span>
                  </DropdownItem>
                </MenuItems>
              </Portal>
            )}
          </>
        )}
      </Menu>
      {isMoveToModalOpen ? (
        <Portal>
          <MoveToModal
            noteId={bookPath}
            onMove={onMove}
            setIsOpen={setIsMoveToModalOpen}
          />
        </Portal>
      ) : null}
      {isRenameModalOpen ? (
        <Portal>
          <RenameModal
            path={bookPath}
            title="Rename the book file"
            keepExt
            hint="Its notes are renamed with it. The title, reading progress, highlights and links to the book stay as they are."
            options={bookRenameOptions(bookPath)}
            isOpen={isRenameModalOpen}
            handleClose={() => setIsRenameModalOpen(false)}
          />
        </Portal>
      ) : null}
    </>
  );
};

export const SidebarBookDropdown = memo(SidebarBookLinkDropdown);
