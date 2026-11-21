import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Menu, MenuButton, MenuItems } from "@headlessui/react";
import {
  TbArrowsLeftRight as IconSwap,
  TbBookOff as IconBookOff,
  TbCheck as IconCheck,
  TbColumns2 as IconColumns,
  TbDots as IconDots,
  TbFile as IconFile,
  TbFileText as IconFileText,
  TbMarkdown as IconMarkdown,
  TbPhoto as IconPhoto,
  TbPuzzle as IconPuzzle,
  TbSettings as IconSettings,
  TbTournament as IconTournament,
  TbTrash as IconTrash,
  TbX as IconX,
} from "react-icons/tb";
import { usePopper } from "react-popper";
import ViewMenu from "@/shell/ViewMenu";
import { useCurrentMdContext } from "@/writer/useCurrentMd";
import { exportPdf, exportPng } from "@/writer/hooks/useExport";
import { store, useStore } from "@/state/store";
import useIsMobile from "@/lib/hooks/useIsMobile";
import { closeBeside, reloadBeside, swapBeside } from "@/writer/beside";
import { openFilePath } from "@/workspace/open";
import { Spinner, Tooltip } from "@/ui/ui";
import Portal from "@/ui/Portal";
import Dropdown, { DropdownItem } from "@/ui/Dropdown";
import NoteMetadata from "@/writer/NoteMetadata";
import NoteDelModal from "@/writer/NoteDelModal";
import EditorSettings from "@/shell/settings/EditorSettings";
import { usePluginNoteModes } from "@/plugins/PluginNoteMode";
import { PluginIcon } from "@/plugins/PluginIcon";
import { useT } from "@/i18n";

// what to open beside: its list of books is of the reader, loaded on use
const BesideMenu = lazy(() => import("@/writer/BesideMenu"));
const DictateButton = lazy(() => import("@/ai/DictateButton"));

/** the modes of plugins shown as buttons, each its own; more are in a list */
const MAX_MODE_BUTTONS = 2;

export default function NoteHeader({
  setShowBacklink,
}: {
  setShowBacklink: (show: boolean) => void;
}) {
  const t = useT();
  const currentNote = useCurrentMdContext();
  const note = useStore((state) => state.notes.get(currentNote.id));

  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(
    menuButtonRef.current,
    popperElement,
    { placement: "bottom-start" },
  );

  const rawMode = useStore((state) => state.rawMode);
  const readMode = useStore((state) => state.readMode);
  const besideOpen = useStore((state) => Boolean(state.besideNoteId));
  const darkMode = useStore((state) => state.darkMode);
  const setRawMode = useStore((state) => state.setRawMode);
  const pluginModes = usePluginNoteModes();
  // the mode is of all the notes: the ones shown read again, as saved
  const setRaw = useCallback(
    async (mode: string) => {
      const shown = store.getState().currentNoteId;
      if (shown) await openFilePath(shown, true);
      await reloadBeside();
      setRawMode(mode);
      setShowBacklink(false);
    },
    [setRawMode, setShowBacklink],
  );
  const beside = Boolean(currentNote.beside);
  const mobile = useIsMobile();
  const [besideMenu, setBesideMenu] = useState(false);

  const [isNoteDelModalOpen, setIsNoteDelModalOpen] = useState(false);
  const onDelClick = useCallback(() => setIsNoteDelModalOpen(true), []);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const buttonClassName =
    "rounded-sm hover:bg-base-content/15 active:bg-base-content/25";
  const iconClass = "text-base-content/70";
  const switchClass = `px-1 ${buttonClassName}`;

  return (
    <div
      className={`flex items-center justify-between w-full px-2 py-1 mb-2 text-right`}
    >
      <div className="flex items-center" id="note-header-btns">
        {beside ? null : <ViewMenu className="me-1" />}
        <Tooltip content={t("WYSIWYG")}>
          <button className={switchClass} onClick={() => setRaw("wysiwyg")}>
            <IconFileText
              className={`${rawMode === "wysiwyg" ? "text-success" : iconClass}`}
            />
          </button>
        </Tooltip>
        <Tooltip content={t("Markdown")}>
          <button className={switchClass} onClick={() => setRaw("raw")}>
            <IconMarkdown
              className={`${rawMode === "raw" ? "text-success" : iconClass}`}
            />
          </button>
        </Tooltip>
        <Tooltip content={t("MindMap")}>
          <button className={switchClass} onClick={() => setRaw("mindmap")}>
            <IconTournament
              className={`rotate-180 ${rawMode === "mindmap" ? "text-success" : iconClass}`}
            />
          </button>
        </Tooltip>
        {pluginModes.length > MAX_MODE_BUTTONS ? (
          // many: in a list under one button, as the actions on the text
          <Dropdown
            buttonChildren={
              <>
                <IconPuzzle
                  className={
                    pluginModes.some((m) => m.name === rawMode)
                      ? "text-success"
                      : iconClass
                  }
                />
                <span className="sr-only">{t("Modes of plugins")}</span>
              </>
            }
            buttonClassName={`${switchClass} h-6 flex items-center`}
            itemsClassName="w-60"
            placement="bottom-start"
            tooltipContent={t("Modes of plugins")}
          >
            {pluginModes.map(({ plugin, mode, name }) => (
              <DropdownItem key={name} onClick={() => void setRaw(name)}>
                <PluginIcon plugin={plugin} size={16} className="mr-2" />
                <span className="truncate">{mode.title}</span>
                <span className="pl-2 ml-auto text-xs truncate text-base-content/60">
                  {plugin.manifest?.name}
                </span>
                {rawMode === name ? (
                  <IconCheck size={14} className="ml-1 text-success shrink-0" />
                ) : null}
              </DropdownItem>
            ))}
          </Dropdown>
        ) : (
          pluginModes.map(({ plugin, mode, name }) => (
            <Tooltip
              key={name}
              content={`${mode.title} (${plugin.manifest?.name ?? plugin.id})`}
            >
              <button
                className={`${switchClass} h-6 flex items-center ${rawMode === name ? "bg-base-content/15" : ""}`}
                aria-label={mode.title}
                aria-pressed={rawMode === name}
                onClick={() => setRaw(name)}
              >
                <PluginIcon
                  plugin={plugin}
                  size={16}
                  className={rawMode === name ? "text-success" : iconClass}
                />
              </button>
            </Tooltip>
          ))
        )}
      </div>
      <div className="flex items-center">
        {readMode ? null : (
          <Suspense fallback={null}>
            <DictateButton
              noteId={currentNote.id}
              className={buttonClassName}
              iconClass={iconClass}
            />
          </Suspense>
        )}
        {beside ? (
          <>
            {currentNote.closeBook ? (
              <Tooltip content={t("Close the book, keep writing")}>
                <button
                  aria-label={t("Close the book, keep writing")}
                  className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
                  onClick={currentNote.closeBook}
                >
                  <IconBookOff size={18} className={iconClass} />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content={t("Swap sides")}>
              <button
                aria-label={t("Swap sides")}
                className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
                onClick={swapBeside}
              >
                <IconSwap size={18} className={iconClass} />
              </button>
            </Tooltip>
            <Tooltip content={t("Close the note beside")}>
              <button
                aria-label={t("Close the note beside")}
                className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
                onClick={closeBeside}
              >
                <IconX size={18} className={iconClass} />
              </button>
            </Tooltip>
          </>
        ) : mobile ? null : (
          <div className="relative">
            <Tooltip content={t("Open beside")}>
              <button
                aria-label={t("Open beside")}
                className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
                onClick={() => setBesideMenu(!besideMenu)}
              >
                <IconColumns
                  size={18}
                  className={
                    besideMenu || besideOpen ? "text-primary" : iconClass
                  }
                />
              </button>
            </Tooltip>
            {besideMenu ? (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setBesideMenu(false)}
                />
                <div className="absolute right-0 z-40 mt-1 text-left border rounded-md shadow-lg bg-base-100 border-base-300">
                  <Suspense fallback={<Spinner className="m-3" />}>
                    <BesideMenu
                      noteId={currentNote.id}
                      onDone={() => setBesideMenu(false)}
                    />
                  </Suspense>
                </div>
              </>
            ) : null}
          </div>
        )}
        <div className="relative">
          <Tooltip content={t("Editor Settings")}>
            <button
              aria-label={t("Editor Settings")}
              className={`flex items-center justify-center w-8 h-8 ${buttonClassName}`}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <IconSettings
                size={18}
                className={settingsOpen ? "text-primary" : iconClass}
              />
            </button>
          </Tooltip>
          {settingsOpen ? (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setSettingsOpen(false)}
              />
              <div className="absolute right-0 z-40 mt-1 text-left border rounded-md shadow-lg bg-base-100 border-base-300">
                <EditorSettings />
              </div>
            </>
          ) : null}
        </div>
        <Menu>
          {({ open }) => (
            <>
              <MenuButton ref={menuButtonRef} className={buttonClassName}>
                <Tooltip content={t("Options (Delete...)")}>
                  <span className="flex items-center justify-center w-8 h-8">
                    <IconDots size={18} className={iconClass} />
                  </span>
                </Tooltip>
              </MenuButton>
              {open && (
                <Portal>
                  <MenuItems
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
                      <span>{t("Delete Permanently")}</span>
                    </DropdownItem>
                    <DropdownItem
                      onClick={() =>
                        exportPdf(note?.title ?? "", darkMode, beside)
                      }
                      className="border-t border-base-300"
                    >
                      <IconFile className="mr-1" />
                      <span>{t("Export PDF")}</span>
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => exportPng(currentNote.id, beside)}
                      className="border-t border-base-300"
                    >
                      <IconPhoto className="mr-1" />
                      <span>{t("Export PNG")}</span>
                    </DropdownItem>
                    <NoteMetadata noteId={currentNote.id} />
                  </MenuItems>
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
            noteTitle={note?.title ?? ""}
            isOpen={isNoteDelModalOpen}
            handleClose={() => setIsNoteDelModalOpen(false)}
          />
        </Portal>
      ) : null}
    </div>
  );
}
