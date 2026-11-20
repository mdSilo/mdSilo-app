import type { ForwardedRef } from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import type { IconType as Icon } from "react-icons";
import {
  TbFilePlus as IconFilePlus,
  TbSearch as IconSearch,
} from "react-icons/tb";
import { useCurrentViewContext } from "@/state/useCurrentView";
import useNoteSearch from "@/lib/hooks/useNoteSearch";
import { ciStringEqual, regDateStr } from "@/lib/helper";
import { joinPaths } from "@/workspace/util";
import { openFilePath } from "@/workspace/open";
import { writeFile } from "@/workspace/write";
import { Notes, store, useStore } from "@/state/store";
import { defaultNote } from "@/types/model";
import { newNoteDir } from "@/workspace/layout";
import { checkFileIsMd } from "@/workspace/process";
import { useT } from "@/i18n";

/** the notes offered before a search, to pick one */
const RECENT_NOTES = 8;

enum OptionType {
  NOTE,
  NEW_NOTE,
}

type Option = {
  id: string;
  type: OptionType;
  text: string;
  icon?: Icon;
};

type Props = {
  onOptionClick?: () => void;
  /** the note picked or made: to open elsewhere, not in the view */
  onPick?: (noteId: string) => void;
  /** the notes not to offer */
  exclude?: (noteId: string) => boolean;
  /** smaller, e.g. in a menu */
  compact?: boolean;
  className?: string;
};

function FindOrCreateInput(props: Props, ref: ForwardedRef<HTMLInputElement>) {
  const t = useT();
  const {
    onOptionClick: onOptionClickCallback,
    onPick,
    exclude,
    compact = false,
    className = "",
  } = props;

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const currentDir = useStore((state) => state.currentDir);

  const [inputText, setInputText] = useState("");
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  const inputTxt = inputText.trim();
  const search = useNoteSearch({ numOfResults: 10 });
  const searchResults = useMemo(
    () =>
      exclude
        ? search(inputTxt).filter((r) => !exclude(r.item.id))
        : search(inputTxt),
    [search, inputTxt, exclude],
  );

  // to pick a note (onPick): the notes written last, before any search
  const notes = useStore((state) => state.notes);
  const recent = useMemo(
    () =>
      onPick && !inputTxt
        ? notes
            .values()
            .filter((n) => !n.is_dir && checkFileIsMd(n.id) && !exclude?.(n.id))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, RECENT_NOTES)
        : [],
    [notes, onPick, inputTxt, exclude],
  );

  const options = useMemo(() => {
    const result: Array<Option> = [];
    for (const note of recent)
      result.push({ id: note.id, type: OptionType.NOTE, text: note.title });
    // Show new note option if there isn't a note called `inputTxt`
    if (
      inputTxt &&
      (searchResults.length <= 0 ||
        !ciStringEqual(inputTxt, searchResults[0].item.title))
    ) {
      result.push({
        id: "NEW_NOTE",
        type: OptionType.NEW_NOTE,
        text: t("New: {name}", { name: inputTxt }),
        icon: IconFilePlus,
      });
    }
    // Show notes that match `inputTxt`
    result.push(
      ...searchResults.map((result) => ({
        id: result.item.id,
        type: OptionType.NOTE,
        text: result.item.title,
      })),
    );
    return result;
  }, [searchResults, inputTxt, recent, t]);

  const onOptionClick = useCallback(
    async (option: Option) => {
      onOptionClickCallback?.();

      if (option.type === OptionType.NEW_NOTE) {
        // at the root of a workspace: in writing/
        const noteDir = newNoteDir(currentDir);
        if (!noteDir) return;
        const notePath = await joinPaths(noteDir, [`${inputTxt}.md`]);
        const note = {
          ...defaultNote,
          id: notePath,
          title: inputTxt,
          file_path: notePath,
          is_daily: regDateStr.test(inputTxt),
        };
        await writeFile(notePath, " ");
        store.getState().upsertNote(note);
        store.getState().upsertTree(noteDir, [note]);
        if (onPick) {
          onPick(note.id);
          return;
        }
        // navigate to md view
        const cNote: Notes = {};
        cNote[note.id] = note;
        store.getState().setCurrentNote(cNote);
        dispatch({ view: "md", params: { noteId: note.id } });
      } else if (option.type === OptionType.NOTE) {
        if (onPick) {
          onPick(option.id);
          return;
        }
        await openFilePath(option.id, true);
        dispatch({ view: "md", params: { noteId: option.id } });
      }
    },
    [onOptionClickCallback, onPick, currentDir, inputTxt, dispatch],
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
        <IconSearch
          className={`${compact ? "ml-2" : "ml-4"} text-base-content/60`}
          size={compact ? 16 : 20}
        />
        <input
          ref={ref}
          type="text"
          className={`w-full ${compact ? "py-2 text-sm" : "py-4 text-xl"} px-2 border-none rounded-tl rounded-tr focus:ring-0 bg-base-200 ${
            options.length <= 0 ? "rounded-bl rounded-br" : ""
          }`}
          placeholder={t("new or find")}
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
              compact={compact}
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
  compact?: boolean;
  isSelected: boolean;
  onClick: () => void;
};

const OptionItem = (props: OptionProps) => {
  const { option, isSelected, onClick, compact } = props;

  return (
    <button
      className={`flex flex-row w-full items-center ${compact ? "px-3 py-1.5 text-sm" : "px-4 py-2"} text-base-content hover:bg-base-content/5 active:bg-base-content/10 ${
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

export default forwardRef(FindOrCreateInput);
