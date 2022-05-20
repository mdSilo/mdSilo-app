import type { ForwardedRef } from 'react';
import { forwardRef, useCallback, useMemo, useState } from 'react';
import { IconChevronsUp, IconSearch, TablerIcon } from '@tabler/icons';
import useNoteSearch from 'editor/hooks/useNoteSearch';
import { useStore } from 'lib/store';
import { ciStringCompare } from 'utils/helper';
import { writeJsonFile } from 'file/write';
import FileAPI from 'file/files';

enum OptionType {
  DIR,
  ROOT,
}

type Option = {
  id: string;
  type: OptionType;
  text: string;
  icon?: TablerIcon;
};

type Props = {
  noteId: string;
  onOptionClick?: () => void;
  className?: string;
};

function MoveToInput(props: Props, ref: ForwardedRef<HTMLInputElement>) {
  const {
    noteId,
    onOptionClick: onOptionClickCallback,
    className = '',
  } = props;

  const [inputText, setInputText] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  const noteTree = useStore((state) => state.noteTree);
  const notes = useStore((state) => state.notes);
  const deleteNote = useStore((state) => state.deleteNote);
  const upsertNote = useStore((state) => state.upsertNote);
  const upsertTree = useStore((state) => state.upsertTree);
  const currentDir = useStore((state) => state.currentDir);

  const inputTxt = inputText.trim();
  const search = useNoteSearch({ numOfResults: 10, searchDir: true });
  const searchResults = useMemo(() => search(inputTxt), [search, inputTxt]);

  const options = useMemo(() => {
    const result: Option[] = [];
    if (!inputTxt) {
      // Include the root and nine top-level notes sorted alphabetically
      result.push({
        id: 'root',
        type: OptionType.ROOT,
        text: 'Move to root',
        icon: IconChevronsUp,
      });
      result.push(
        ...noteTree
          .filter((item) => item.isDir && item.id !== noteId)
          .map((item) => ({
            id: item.id,
            type: OptionType.DIR,
            text: notes[item.id].title,
          }))
          .sort((n1, n2) => ciStringCompare(n1.text, n2.text))
          .slice(0, 9)
      );
    } else {
      result.push(
        ...searchResults
          .filter((result) => result.item.id !== noteId)
          .map((result) => ({
            id: result.item.id,
            type: OptionType.DIR,
            text: result.item.title,
          }))
      );
    }
    return result;
  }, [searchResults, noteId, inputTxt, noteTree, notes]);

  const onOptionClick = useCallback(
    async (option: Option) => {
      onOptionClickCallback?.();
      let tarDir: string | undefined;
      // move tree in store
      if (option.type === OptionType.ROOT) {
        // moveNoteTreeItem(noteId, null);
        tarDir = currentDir;
      } else if (option.type === OptionType.DIR) {
        // moveNoteTreeItem(noteId, option.id);
        tarDir = option.id;
      }
      // move file in disk and store
      if (tarDir) {
        const thisFile = new FileAPI(noteId);
        const tarPath = await thisFile.moveFile(tarDir);
        if (tarPath) {
          const oldNote =  notes[noteId];
          const newNote = {
            ...oldNote,
            id: tarPath,
            file_path: tarPath,
          };
          deleteNote(noteId);
          upsertNote(newNote);
          upsertTree(newNote, tarDir);
        }
        console.log("move: ", noteId, tarPath)
      }
      // sync the Moved hierarchy to JSON
      if (currentDir) {
        await writeJsonFile(currentDir);
      }
    },
    [onOptionClickCallback, currentDir, noteId, notes, deleteNote, upsertNote, upsertTree]
  );

  const onKeyDown = useCallback(
    (event) => {
      // Update the selected option based on arrow key input
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedOptionIndex((index) => {
          return index <= 0 ? options.length - 1 : index - 1;
        });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedOptionIndex((index) => {
          return index >= options.length - 1 ? 0 : index + 1;
        });
      }
    },
    [options.length]
  );

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center flex-shrink-0 w-full">
        <IconSearch className="ml-4 text-gray-500" size={20} />
        <input
          ref={ref}
          type="text"
          className={`w-full py-4 px-2 text-xl border-none rounded-tl rounded-tr focus:ring-0 dark:bg-gray-800 dark:text-gray-200 ${
            options.length <= 0 ? 'rounded-bl rounded-br' : ''
          }`}
          placeholder="Search to move to"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyPress={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onOptionClick(options[selectedOptionIndex]);
            }
          }}
          autoFocus
        />
      </div>
      {options.length > 0 ? (
        <div className="flex-1 w-full overflow-y-auto bg-white border-t rounded-bl rounded-br dark:bg-gray-800 dark:border-gray-700">
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
      className={`flex flex-row w-full items-center px-4 py-2 text-gray-800 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 ${
        isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
      }`}
      onClick={onClick}
    >
      {option.icon ? (
        <option.icon size={18} className="flex-shrink-0 mr-1" />
      ) : null}
      <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
        {option.text}
      </span>
    </button>
  );
};

export default forwardRef(MoveToInput);
