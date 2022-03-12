import { useMemo, useState, useCallback, useEffect } from 'react';
import { Editor, Element, Range, Transforms } from 'slate';
import { useSlate } from 'slate-react';
import type { TablerIcon } from '@tabler/icons';
import { ElementType } from 'editor/slate';
import { insertTag } from 'editor/formatting';
import { deleteText } from 'editor/transforms';
//import useDebounce from 'editor/hooks/useDebounce';
import EditorPopover from '../EditorPopover';

// when type `/` or `\`, to trigger menu
const SLASH_REGEX = /(?:^|\s)(\/|\\)/;
//const DEBOUNCE_MS = 100;

enum OptionType {
  SLASH,
}

type Option = {
  id: string;
  type: OptionType;
  text: string;
  icon?: TablerIcon;
};

export default function SlashAutocompletePopover() {
  const editor = useSlate();

  const [isVisible, setIsVisible] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);

  const options = useMemo(
    () => [
      {
        id: 'now',
        type: OptionType.SLASH,
        text: 'Time: Now',
      },
      {
        id: 'today',
        type: OptionType.SLASH,
        text: 'Date: Today',
      },
      {
        id: 'todo',
        type: OptionType.SLASH,
        text: 'Task: Todo',
      },
      {
        id: 'doing',
        type: OptionType.SLASH,
        text: 'Task: Doing',
      },
      {
        id: 'done',
        type: OptionType.SLASH,
        text: 'Task: Done',
      },
    ],
    []
  );

  const hidePopover = useCallback(() => {
    setIsVisible(false);
    setSelectedOptionIndex(0);
  }, []);

  const matchSlashRegex = useCallback(() => {
    const { selection } = editor;

    const inCode = Editor.above(editor, {
      match: (n) =>
        !Editor.isEditor(n) &&
        Element.isElement(n) &&
        n.type === ElementType.CodeBlock,
    });

    if (!selection || !Range.isCollapsed(selection) || inCode) {
      return null;
    }

    try {
      const { anchor } = selection;
      const elementStart = Editor.start(editor, anchor.path);
      const elementRange = { anchor, focus: elementStart };
      const elementText = Editor.string(editor, elementRange);
      return elementText.match(SLASH_REGEX);
    } catch (e) {
      return null;
    }
  }, [editor]);

  useEffect(() => {
    const result = matchSlashRegex();

    if (!result) {
      hidePopover();
      return;
    }

    setIsVisible(true);
  }, [editor.children, matchSlashRegex, hidePopover]);

  const onOptionClick = useCallback(
    async (option?: Option) => {
      if (!option || !editor.selection) {
        return;
      }

      // Delete markdown text
      const { path: selectionPath, offset: endOfSelection } =
        editor.selection.anchor;

      // startMark is `/` or `\`
      deleteText(editor, selectionPath, endOfSelection, 1);

      // Handle 
      if (option.type === OptionType.SLASH) {
        const ty = option.id;
        if (ty === 'now') {
          const now = new Date();
          const hr = now.getHours();
          const min = now.getMinutes();
          const hm = `${hr < 10 ? '0' : ''}${hr}:${min < 10 ? '0' : ''}${min}`;
          Transforms.insertText(editor, hm);
        } else if (ty === 'today') {
          const date = new Date();
          const day = date.getDate();
          const mon = date.getMonth() + 1;
          const ymd = `${date.getFullYear()}-${mon<10 ? '0' : ''}${mon}-${day<10 ? '0' : ''}${day}`;
          Transforms.insertText(editor, ymd);
        } else if (['todo', 'doing', 'done'].includes(ty)) {
          insertTag(editor, option.id);
        }
        Transforms.move(editor, { distance: 1, unit: 'offset' });
      } else {
        throw new Error(`Option type ${option.type} is not supported`);
      }

      hidePopover();
    },
    [editor, hidePopover]
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
      className="flex flex-col"
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
