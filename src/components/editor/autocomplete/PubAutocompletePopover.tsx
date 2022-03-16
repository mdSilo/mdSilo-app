import { useMemo, useState, useCallback, useEffect } from 'react';
import { Editor, Range, Transforms } from 'slate';
import { useSlate } from 'slate-react';
import type { TablerIcon } from '@tabler/icons';
import { store } from 'lib/store';
import type { Note } from 'types/model';
import { defaultNote } from 'types/model';
import { insertPubLink } from 'editor/formatting';
import { deleteText } from 'editor/transforms';
//import { loadDbWikiNotes } from 'lib/api/curdNote';
import useNoteSearch from 'editor/hooks/useNoteSearch';
import useDebounce from 'editor/hooks/useDebounce';
import EditorPopover from '../EditorPopover';


// when type `{{w`, pub-link
const PUB_LINK_REGEX = /(?:^|\s)(\{\{)(.+)/;
const DEBOUNCE_MS = 10;

enum OptionType {
  PUB,
}

type Option = {
  id: string;
  type: OptionType;
  text: string;
  icon?: TablerIcon;
};

export default function PubAutocompletePopover() {
  const editor = useSlate();

  const [isVisible, setIsVisible] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);
  const [regexResult, setRegexResult] = useState<RegExpMatchArray | null>(null);

  const inputText = useMemo(() => {
    if (!regexResult) {
      return '';
    } else {
      return regexResult[2];
    }
  }, [regexResult]);
  const [linkText] = useDebounce(inputText, DEBOUNCE_MS);

  // seach is_wiki = true only and from serve directly
  // 1- search from serve
  // 2- store in a temp array
  // 3- useNoteSearch locally
  const [tempNotes, setTempNotes] = useState<Note[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSearch = useCallback(async (linkText: string) => {
    //const notesRes = await loadDbWikiNotes(linkText); // FIXME TODO
    const notes = null; //notesRes?.data;
    if (notes) {
      setTempNotes(notes);
    }
  }, []);
  
  // limit the min linkText length to trigger load search
  useEffect(() => { 
    const len = linkText.trim().length;
    if (len >= 3) {
      getSearch(linkText); 
    }
  }, [linkText, getSearch]);

  const search = useNoteSearch(
    { numOfResults: 10, searchWiki: true, notesBase: tempNotes }
  );
  const searchResults = useMemo(() => search(linkText), [search, linkText]);

  const options = useMemo(
    () =>
      searchResults.map((result) => ({
        id: result.item.id,
        type: OptionType.PUB,
        text: result.item.title,
      })),
    [searchResults]
  );

  const hidePopover = useCallback(() => {
    setIsVisible(false);
    setRegexResult(null);
    setSelectedOptionIndex(0);
  }, []);

  const getRegexResult = useCallback(() => {
    const { selection } = editor;

    if (!selection || !Range.isCollapsed(selection)) {
      return null;
    }

    try {
      const { anchor } = selection;

      const elementStart = Editor.start(editor, anchor.path);
      const elementRange = { anchor, focus: elementStart };
      const elementText = Editor.string(editor, elementRange);

      return elementText.match(PUB_LINK_REGEX);
    } catch (e) {
      return null;
    }
  }, [editor]);

  useEffect(() => {
    const result = getRegexResult();

    if (!result) {
      hidePopover();
      return;
    }

    setRegexResult(result);
    setIsVisible(true);
  }, [editor.children, getRegexResult, hidePopover]);

  const onOptionClick = useCallback(
    async (option?: Option) => {
      if (!option || !regexResult || !editor.selection) {
        return;
      }

      // Delete markdown text
      const { path: selectionPath, offset: endOfSelection } =
        editor.selection.anchor;

      const [, startMark, noteTitle] = regexResult;
      const lengthToDelete = startMark.length + noteTitle.length;

      deleteText(editor, selectionPath, endOfSelection, lengthToDelete);

      // Handle inserting PubLink
      if (option.type === OptionType.PUB) {
        // Insert a link to an existing note with the note title as the link text
        insertPubLink(editor, option.id, option.text);
        Transforms.move(editor, { distance: 1, unit: 'offset' }); // Focus after the note link
        // upsertNote locally, and 
        // update wikitree locally, but cannot get currentNoteID
        let selectedNote: Note = {
          ...defaultNote,
          id: option.id,
          title: option.text,
          is_wiki: true,
        };
        for (const note of tempNotes) {
          if (note.id === option.id) {
            selectedNote = note;
          }
        }
        store.getState().upsertNote(selectedNote);
      }

      hidePopover();
    },
    [editor, hidePopover, regexResult, tempNotes]
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
      } else if (event.key === 'Enter') {
        // We need both preventDefault and stopPropagation to prevent an enter being added
        event.preventDefault();
        event.stopPropagation();
        onOptionClick(options[selectedOptionIndex]);
      }
    },
    [onOptionClick, options, selectedOptionIndex]
  );

  useEffect(() => {
    if (isVisible && options.length > 0) {
      document.addEventListener('keydown', onKeyDown, true);

      return () => {
        document.removeEventListener('keydown', onKeyDown, true);
      };
    }
  }, [isVisible, onKeyDown, options.length]);

  return isVisible && options.length > 0 ? (
    <EditorPopover
      placement="bottom"
      className="flex flex-col w-auto"
      onClose={hidePopover}
    >
      {options.map((option, index) => (
        <OptionItem
          key={option.id}
          option={option}
          isSelected={index === selectedOptionIndex}
          onClick={() => onOptionClick(option)}
        />
      ))}
    </EditorPopover>
  ) : null;
}

type OptionProps = {
  option: Option;
  isSelected: boolean;
  onClick: () => void;
};

const OptionItem = (props: OptionProps) => {
  const { option, isSelected, onClick } = props;
  return (
    <div
      className={`flex flex-row items-center px-4 py-1 cursor-pointer text-gray-800 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 ${
        isSelected ? 'bg-gray-100 dark:bg-gray-700' : ''
      }`}
      onPointerDown={(event) => event.preventDefault()}
      onPointerUp={(event) => {
        if (event.button === 0) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {option.icon ? (
        <option.icon size={18} className="flex-shrink-0 mr-1" />
      ) : null}
      <span className="overflow-hidden overflow-ellipsis whitespace-nowrap">
        {option.text}
      </span>
    </div>
  );
};
