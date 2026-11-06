import type { ForwardedRef } from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import {
  TbChevronsUp as IconChevronsUp,
  TbFolderPlus as IconFolderPlus,
  TbSearch as IconSearch,
} from "react-icons/tb";
import type { IconType as Icon } from "react-icons";
import useNoteSearch from "@/lib/hooks/useNoteSearch";
import { store, useStore } from "@/state/store";
import type { Note } from "@/types/model";
import { ciStringCompare } from "@/lib/helper";
import { followRename } from "@/workspace/renames";
import { moveIntoDir } from "@/shell/sidebar/treeMove";
import useLoadNotes from "@/lib/hooks/useLoadNotes";
import { createDirRecursive, joinPaths } from "@/workspace/util";

enum OptionType {
  DIR,
  ROOT,
  NEW,
}

type Option = {
  id: string;
  type: OptionType;
  text: string;
  icon?: Icon;
};

type Props = {
  noteId: string;
  /** moves it into the dir, instead of moving it as a note */
  onMove?: (tarDir: string) => Promise<unknown>;
  onOptionClick?: () => void;
  className?: string;
};

function MoveToInput(props: Props, ref: ForwardedRef<HTMLInputElement>) {
  const {
    noteId,
    onMove,
    onOptionClick: onOptionClickCallback,
    className = "",
  } = props;

  useLoadNotes();
  const initDir = useStore((state) => state.initDir);
  const currentDir = useStore((state) => state.currentDir);

  const [inputText, setInputText] = useState("");
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  const noteTree = useStore((state) => state.noteTree);

  const inputTxt = inputText.trim();
  const search = useNoteSearch({ numOfResults: 10, searchDir: true });
  const searchResults = useMemo(() => search(inputTxt), [search, inputTxt]);

  const options = useMemo(() => {
    const result: Option[] = [];
    if (!inputTxt) {
      // Include the root and nine top-level notes sorted alphabetically
      result.push({
        id: "root",
        type: OptionType.ROOT,
        text: "Move to root",
        icon: IconChevronsUp,
      });
      result.push(
        ...Object.values(noteTree)
          .flat()
          .filter((item) => item.is_dir && item.id !== noteId)
          .map((item) => ({
            id: item.id,
            type: OptionType.DIR,
            text: item.title,
          }))
          .sort((n1, n2) => ciStringCompare(n1.text, n2.text))
          .slice(0, 9),
      );
    } else {
      result.push({
        id: "NEW_FOLDER",
        type: OptionType.NEW,
        text: `New Folder: ${inputTxt}`,
        icon: IconFolderPlus,
      });
      result.push(
        ...searchResults
          .filter((result) => result.item.id !== noteId)
          .map((result) => ({
            id: result.item.id,
            type: OptionType.DIR,
            text: result.item.title,
          })),
      );
    }
    return result;
  }, [searchResults, noteId, inputTxt, noteTree]);

  const onOptionClick = useCallback(
    async (option: Option) => {
      onOptionClickCallback?.();
      let tarDir: string | undefined;
      if (option.type === OptionType.ROOT) {
        tarDir = initDir;
      } else if (option.type === OptionType.DIR) {
        tarDir = option.id;
      } else if (option.type === OptionType.NEW) {
        if (currentDir) {
          const newDir = await joinPaths(currentDir, [inputTxt]);
          const res = await createDirRecursive(newDir);
          tarDir = res ? newDir : undefined;
        }
      }
      if (tarDir && onMove) {
        await onMove(tarDir);
      } else if (tarDir) {
        await moveNote(noteId, tarDir);
      }
    },
    [onOptionClickCallback, onMove, initDir, currentDir, inputTxt, noteId],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Update the selected option based on arrow key input
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedOptionIndex((index) => {
          return index <= 0 ? options.length - 1 : index - 1;
        });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedOptionIndex((index) => {
          return index >= options.length - 1 ? 0 : index + 1;
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selectedOption = options[selectedOptionIndex];
        if (selectedOption) {
          onOptionClick(selectedOption);
        }
      }
    },
    [onOptionClick, options, selectedOptionIndex],
  );

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center shrink-0 w-full">
        <IconSearch className="ml-4 text-base-content/60" size={20} />
        <input
          ref={ref}
          type="text"
          className={`w-full py-4 px-2 text-xl border-none rounded-tl rounded-tr focus:ring-0 bg-base-200 ${
            options.length <= 0 ? "rounded-bl rounded-br" : ""
          }`}
          placeholder="Search to move to"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
      </div>
      {options.length > 0 ? (
        <div className="flex-1 w-full overflow-y-auto bg-base-200 border-t rounded-bl rounded-br border-base-300">
          {options.map((option, index) => (
            <OptionItem
              key={option.id}
              option={option}
              isSelected={index === selectedOptionIndex}
              onClick={() => onOptionClick(option)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type OptionProps = {
  option: Option;
  isSelected: boolean;
  onClick: () => void;
};

const OptionItem = (props: OptionProps) => {
  const { option, isSelected, onClick } = props;
  return (
    <button
      className={`flex flex-row w-full items-center px-4 py-2 text-base-content hover:bg-base-content/5 active:bg-base-content/10 ${
        isSelected ? "bg-base-content/10" : ""
      }`}
      onClick={onClick}
    >
      {option.icon ? <option.icon size={18} className="shrink-0 mr-1" /> : null}
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {option.text}
      </span>
    </button>
  );
};

export default forwardRef(MoveToInput);

/**
 * Move a note into the dir, never over an existing file: its changes saved
 * first (moveIntoDir); then followed as a rename: the issues linked to it,
 * the view of it. The links by title stay as they are.
 * @returns the new path, if moved
 */
export async function moveNote(
  noteId: string,
  tarDir: string,
): Promise<string | undefined> {
  const tarPath = await moveIntoDir(noteId, tarDir);
  if (!tarPath) return;
  // in the tree at once, the watcher sees it later
  const oldNote = store.getState().notes.get(noteId);
  if (oldNote) moveNoteTreeItem(noteId, tarDir, tarPath, oldNote);
  await followRename(noteId, tarPath);
  return tarPath;
}

export const moveNoteTreeItem = (
  srcPath: string,
  tarDir: string,
  tarPath: string,
  oldNote: Note,
) => {
  // Don't do anything if the note ids are the same
  if (srcPath === tarPath) {
    return;
  }
  const newNote = {
    ...oldNote,
    id: tarPath,
    file_path: tarPath,
  };
  store.getState().deleteNote(srcPath);
  store.getState().upsertNote(newNote);
  store.getState().upsertTree(tarDir, [newNote]);
  // console.log("move item: ", srcPath, tarPath);
};
