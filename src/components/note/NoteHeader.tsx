import { useCallback, useRef, useState } from 'react';
import { Menu } from '@headlessui/react';
import { 
  TbDots as IconDots, TbFile as IconFile, TbFileText as IconFileText, TbMarkdown as IconMarkdown,
  TbPhoto as IconPhoto, TbSettings as IconSettings, TbTournament as IconTournament, TbTrash as IconTrash
} from 'react-icons/tb';
import { usePopper } from 'react-popper';
import { useCurrentMdContext } from '@/writer/useCurrentMd';
import { ExportAs } from '@/editor/hooks/useExport';
import { useStore } from '@/state/store';
import { openFilePath } from '@/workspace/open';
import { Tooltip } from '@/ui/ui';
import Portal from '@/ui/Portal';
import { DropdownItem } from '@/ui/Dropdown';
import NoteMetadata from '@/components/note/NoteMetadata';
import NoteDelModal from '@/components/note/NoteDelModal';
import EditorSettings from '@/components/settings/EditorSettings';

export default function NoteHeader(
  {setShowBacklink} : {setShowBacklink : (show: boolean) => void}
) {
  const currentNote = useCurrentMdContext();
  const note = useStore((state) => state.notes.get(currentNote.id));

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(
    null
  );
  const { styles, attributes } = usePopper(
    menuButtonRef.current,
    popperElement,
    { placement: 'bottom-start' }
  );

  const rawMode = useStore((state) => state.rawMode);
  const setRawMode = useStore((state) => state.setRawMode);
  const setRaw = useCallback(
    async (mode: string) => {
      await openFilePath(currentNote.id, true);
      setRawMode(mode);
      setShowBacklink(false);
    }, 
    [currentNote.id, setRawMode, setShowBacklink]
  );

  const [isNoteDelModalOpen, setIsNoteDelModalOpen] = useState(false);
  const onDelClick = useCallback(() => setIsNoteDelModalOpen(true), []);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const buttonClassName =
    'rounded-sm hover:bg-base-content/15 active:bg-base-content/25';
  const iconClass = 'text-base-content/70';
  const switchClass = `px-1 ${buttonClassName}`; 

  return (
    <div className={`flex items-center justify-between w-full px-2 py-1 mb-2 text-right`}>
      <div className="flex items-center" id="note-header-btns">
        <Tooltip content="WYSIWYG">
          <button className={switchClass} onClick={() => setRaw('wysiwyg')}>
            <IconFileText className={`${rawMode === 'wysiwyg' ? 'text-success' :iconClass}`} />
          </button>
        </Tooltip>
        <Tooltip content="Markdown">
          <button className={switchClass} onClick={() => setRaw('raw')}>
            <IconMarkdown className={`${rawMode === 'raw' ? 'text-success' : iconClass}`} />
          </button>
        </Tooltip>
        <Tooltip content="MindMap">
          <button className={switchClass} onClick={() => setRaw('mindmap')}>
            <IconTournament className={`rotate-180 ${rawMode === 'mindmap' ? 'text-success' : iconClass}`} />
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center">
        <div className="relative">
          <Tooltip content="Editor Settings">
            <button
              aria-label="Editor Settings"
              className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <IconSettings size={18} className={settingsOpen ? 'text-primary' : iconClass} />
            </button>
          </Tooltip>
          {settingsOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSettingsOpen(false)} />
              <div className="absolute right-0 z-40 mt-1 text-left border rounded-md shadow-lg bg-base-100 border-base-300">
                <EditorSettings />
              </div>
            </>
          ) : null}
        </div>
        <Menu>
          {({ open }) => (
            <>
              <Menu.Button ref={menuButtonRef} className={buttonClassName}>
                <Tooltip content="Options (Delete...)">
                  <span className="flex items-center justify-center w-8 h-8">
                    <IconDots size={18} className={iconClass} />
                  </span>
                </Tooltip>
              </Menu.Button>
              {open && (
                <Portal>
                  <Menu.Items
                    ref={setPopperElement}
                    className="z-10 w-56 overflow-hidden bg-base-200 rounded-sm shadow-popover focus:outline-hidden"
                    static
                    style={styles.popper}
                    {...attributes.popper}
                  >
                    <DropdownItem
                      onClick={onDelClick}
                      className="border-t border-base-300"
                    >
                      <IconTrash className="mr-1" />
                      <span>Delete Permanently</span>
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => ExportAs('pdf', `${currentNote.id}.pdf`)}
                      className="border-t border-base-300"
                    >
                      <IconFile className="mr-1" />
                      <span>Export PDF</span>
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => ExportAs('png', `${currentNote.id}.png`)}
                      className="border-t border-base-300"
                    >
                      <IconPhoto className="mr-1" />
                      <span>Export PNG</span>
                    </DropdownItem>
                    <NoteMetadata noteId={currentNote.id} />
                  </Menu.Items>
                </Portal>
              )}
            </>
          )}
        </Menu>
      </div>
      {isNoteDelModalOpen ? (
        <Portal>
          <NoteDelModal
            noteId={currentNote.id}
            noteTitle={note?.title ?? ''}
            isOpen={isNoteDelModalOpen}
            handleClose={() => setIsNoteDelModalOpen(false)}
          />
        </Portal>
      ) : null}
    </div>
  );
}
