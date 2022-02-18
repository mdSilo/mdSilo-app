import {
  useRef,
  useCallback,
  useMemo,
  useState,
  KeyboardEvent,
  useEffect,
  memo,
} from 'react';
import {
  createEditor,
  Range,
  Editor as SlateEditor,
  Transforms,
  Descendant,
  Path,
} from 'slate';
import { withReact, Editable, ReactEditor, Slate } from 'slate-react';
import { withHistory } from 'slate-history';
import { isHotkey } from 'is-hotkey';
import colors from 'tailwindcss/colors';
import {
  handleEnter,
  handleIndent,
  handleUnindent,
  isElementActive,
  toggleElement,
  toggleMark,
} from '../../editor/formatting';
import withAutoMarkdown from 'editor/plugins/withAutoMarkdown';
import withBlockBreakout from 'editor/plugins/withBlockBreakout';
import withLinks from 'editor/plugins/withLinks';
import withNormalization from 'editor/plugins/withNormalization';
import withCustomDeleteBackward from 'editor/plugins/withCustomDeleteBackward';
import withImages from 'editor/plugins/withImages';
import withVoidElements from 'editor/plugins/withVoidElements';
import withNodeId from 'editor/plugins/withNodeId';
import withBlockReferences from 'editor/plugins/withBlockReferences';
import withTags from 'editor/plugins/withTags';
import withHtml from 'editor/plugins/withHtml';
import withTable from 'editor/plugins/withTable';
//import { useStore } from 'lib/store';
import { ElementType, Mark } from 'editor/slate';
import useIsMounted from 'editor/hooks/useIsMounted';
import HoveringToolbar from './HoveringToolbar';
import AddLinkPopover from './AddLinkPopover';
import EditorElement from './elements/EditorElement';
import EditorLeaf from './elements/EditorLeaf';
import withVerticalSpacing from './elements/withVerticalSpacing';
import withBlockSideMenu from './blockmenu/withBlockSideMenu';
import LinkAutocompletePopover from './autocomplete/LinkAutocompletePopover';
import BlockAutocompletePopover from './autocomplete/BlockAutocompletePopover';
import TagAutocompletePopover from './autocomplete/HashTagAutocompletePopover';
import PubAutocompletePopover from './autocomplete/PubAutocompletePopover';
import SlashAutocompletePopover from './autocomplete/SlashAutocompletePopover';

export type AddLinkPopoverState = {
  isVisible: boolean;
  selection?: Range;
  isLink?: boolean;
};

type Props = {
  noteId?: string;
  value: Descendant[];
  setValue: (value: Descendant[]) => void; // sync to client store
  onChange: (value: Descendant[]) => void; // sync to serve db
  className?: string;
  highlightedPath?: Path;
  isWiki?: boolean;
  isPub?: boolean;
  isDaily?: boolean;
  forceReadMode?: boolean;
};

function Editor(props: Props) {
  const { 
    value, 
    setValue, 
    onChange, 
    className = '', 
    highlightedPath, 
    isWiki = false,
    //forceReadMode = false,
  } = props;
  const isMounted = useIsMounted();

  const isCheckSpellOn = false; //useStore((state) => state.isCheckSpellOn);

  const editorRef = useRef<SlateEditor>();
  if (!editorRef.current) {
    editorRef.current = withNormalization(
      withCustomDeleteBackward(
        withAutoMarkdown(
          withHtml(
            withBlockBreakout(
              withVoidElements(
                withBlockReferences(
                  withImages(
                    withTags(
                      withLinks(
                        withNodeId(
                          withTable(
                            withHistory(
                              withReact(createEditor())
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          ), isWiki
        )
      )
    );
  }
  const editor = editorRef.current;

  const renderElement = useMemo(() => {
    const ElementWithSideMenu = withBlockSideMenu(
      withVerticalSpacing(EditorElement), isWiki
    );
    return ElementWithSideMenu;
  }, [isWiki]);

  const [addLinkPopoverState, setAddLinkPopoverState] =
    useState<AddLinkPopoverState>({
      isVisible: false,
      selection: undefined,
      isLink: false,
    });

  const [selection, setSelection] = useState(editor.selection);
  const [toolbarCanBeVisible, setToolbarCanBeVisible] = useState(true);
  const hasExpandedSelection = useMemo(
    () =>
      !!selection &&
      ReactEditor.isFocused(editor) &&
      !Range.isCollapsed(selection) &&
      SlateEditor.string(editor, selection, { voids: true }) !== '',
    [editor, selection]
  );
  const isToolbarVisible = useMemo(
    () =>
      toolbarCanBeVisible &&
      hasExpandedSelection &&
      !addLinkPopoverState.isVisible,
    [toolbarCanBeVisible, hasExpandedSelection, addLinkPopoverState.isVisible]
  );

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'mod+b',
        callback: () => toggleMark(editor, Mark.Bold),
      },
      {
        hotkey: 'mod+i',
        callback: () => toggleMark(editor, Mark.Italic),
      },
      {
        hotkey: 'mod+u',
        callback: () => toggleMark(editor, Mark.Underline),
      },
      {
        hotkey: 'mod+`',
        callback: () => toggleMark(editor, Mark.Code),
      },
      {
        hotkey: 'mod+shift+s',
        callback: () => toggleMark(editor, Mark.Strikethrough),
      },
      {
        hotkey: 'mod+shift+h',
        callback: () => toggleMark(editor, Mark.Highlight),
      },
      {
        hotkey: 'mod+shift+1',
        callback: () => toggleElement(editor, ElementType.HeadingOne),
      },
      {
        hotkey: 'mod+shift+2',
        callback: () => toggleElement(editor, ElementType.HeadingTwo),
      },
      {
        hotkey: 'mod+shift+3',
        callback: () => toggleElement(editor, ElementType.HeadingThree),
      },
      {
        hotkey: 'mod+shift+4',
        callback: () => toggleElement(editor, ElementType.BulletedList),
      },
      {
        hotkey: 'mod+shift+5',
        callback: () => toggleElement(editor, ElementType.NumberedList),
      },
      {
        hotkey: 'mod+shift+6',
        callback: () => toggleElement(editor, ElementType.CheckListItem),
      },
      {
        hotkey: 'mod+shift+7',
        callback: () => toggleElement(editor, ElementType.Blockquote),
      },
      {
        hotkey: 'mod+shift+8',
        callback: () => toggleElement(editor, ElementType.CodeBlock),
      },
      {
        hotkey: 'mod+shift+9',
        callback: () => toggleElement(editor, ElementType.Paragraph),
      },
      {
        hotkey: 'mod+k',
        callback: () => {
          if (editor.selection) {
            // Save the selection and make the add link popover visible
            setAddLinkPopoverState({
              isVisible: true,
              selection: editor.selection,
              isLink:
                isElementActive(editor, ElementType.ExternalLink) ||
                isElementActive(editor, ElementType.NoteLink),
            });
          }
        },
      },
      {
        hotkey: 'tab',
        callback: () => handleIndent(editor),
      },
      {
        hotkey: 'shift+tab',
        callback: () => handleUnindent(editor),
      },
      {
        hotkey: 'enter',
        callback: () => handleEnter(editor),
      },
      {
        hotkey: 'shift+enter',
        callback: () => Transforms.insertText(editor, '\n'),
      },
      {
        hotkey: 'mod+enter',
        callback: () => editor.insertBreak(),
      },
    ],
    [editor, setAddLinkPopoverState]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Handle keyboard shortcuts for adding marks
      for (const { hotkey, callback } of hotkeys) {
        if (isHotkey(hotkey, event.nativeEvent)) {
          event.preventDefault();
          callback();
        }
      }
    },
    [hotkeys]
  );

  const onSlateChange = useCallback(
    (newValue: Descendant[]) => {
      setSelection(editor.selection);
      // We need this check because this function is called every time
      // the selection changes
      if (newValue !== value) {
        setValue(newValue);
        onChange(newValue);
      }
    },
    [editor.selection, onChange, value, setValue]
  );

  const readMode = false;

  // If highlightedPath is defined, highlight the path
  const darkMode = true;
  useEffect(() => {
    if (!highlightedPath) {
      return;
    }

    try {
      // Scroll to line
      const [node] = SlateEditor.node(editor, highlightedPath);
      const domNode = ReactEditor.toDOMNode(editor, node);
      domNode.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      // Highlight line, but restore original color if mouse is clicked or component is re-rendered
      const originalBgColor = domNode.style.backgroundColor;
      const removeHighlight = () => {
        domNode.style.backgroundColor = originalBgColor;
      };

      domNode.style.backgroundColor = darkMode
        ? colors.yellow[800]
        : colors.yellow[200];
      domNode.addEventListener('click', removeHighlight, { once: true });

      return () => {
        removeHighlight();
        document.removeEventListener('click', removeHighlight);
      };
    } catch (e) {
      // Do nothing if an error occurs, which sometimes happens if the router changes before the editor does
    }
  }, [editor, highlightedPath, darkMode]);

  return (
    <Slate 
      editor={editor} 
      value={value} 
      onChange={ !readMode ? onSlateChange : () => {/*do noting*/} }
    >
      {isToolbarVisible  && !readMode ? (
        <HoveringToolbar setAddLinkPopoverState={setAddLinkPopoverState} />
      ) : null}
      {addLinkPopoverState.isVisible && !(readMode || isWiki) ? (
        <AddLinkPopover
          addLinkPopoverState={addLinkPopoverState}
          setAddLinkPopoverState={setAddLinkPopoverState}
        />
      ) : null}
      {!(readMode || isWiki) ? <LinkAutocompletePopover /> : null}
      {!(readMode || isWiki) ? <BlockAutocompletePopover /> : null}
      {!readMode ? <PubAutocompletePopover /> : null}
      {!readMode ? <TagAutocompletePopover /> : null}
      {!readMode ? <SlashAutocompletePopover /> : null}
      {!readMode ? (
        <Editable
          className={`overflow-hidden placeholder-gray-300 ${className}`}
          renderElement={renderElement}
          renderLeaf={EditorLeaf}
          placeholder="Start writing here…"
          onKeyDown={onKeyDown}
          onPointerDown={() => setToolbarCanBeVisible(false)}
          onPointerUp={() =>
            setTimeout(() => {
              if (isMounted()) setToolbarCanBeVisible(true);
            }, 100)
          }
          spellCheck={isCheckSpellOn}
        />
      ) : (
        <Editable
          className={`overflow-hidden leading-loose ${className}`}
          renderElement={EditorElement}
          renderLeaf={EditorLeaf}
          readOnly
        />
      )}
    </Slate>
  );
}

export default memo(Editor);
