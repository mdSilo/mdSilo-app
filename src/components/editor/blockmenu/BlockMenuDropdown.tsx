import { useCallback, useMemo, useState } from 'react';
import { Editor, Element, Transforms, Path } from 'slate';
import { ReactEditor, useSlateStatic, useSlate } from 'slate-react';
import { 
  IconDotsVertical, TablerIcon, 
  IconLink, IconListCheck, IconBraces, IconPrompt, IconTable
} from '@tabler/icons';
import { ReferenceableBlockElement, TableElement, ElementType, Table } from 'editor/slate';
import Dropdown, { DropdownItem } from 'components/misc/Dropdown';
import Portal from 'components/misc/Portal';
import { isReferenceableBlockElement } from 'editor/checks';
import { toggleElement, isElementActive } from 'editor/formatting';
import { createNodeId } from 'editor/plugins/withNodeId';
import { buildTable, resizeTable } from 'editor/plugins/withTable';
import ChangeBlockOptions from './ChangeBlockOptions';
import TableModal from './TableModal';

type BlockMenuDropdownProps = {
  element: ReferenceableBlockElement | TableElement;
  isWiki?: boolean;
  className?: string;
};

// Dropdown menu for Block at leftend
export default function BlockMenuDropdown(props: BlockMenuDropdownProps) {
  const { element, isWiki = false, className = '' } = props;
  const editor = useSlateStatic();

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);

  const onCopyBlockRef = useCallback(async () => {
    let blockId;

    // We still need this because there are cases where block ids might not exist
    if (!element.id) {
      // Generate block id if it doesn't exist
      blockId = createNodeId();
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        { id: blockId },
        {
          at: path,
          match: (n) =>
            Element.isElement(n) &&
            isReferenceableBlockElement(n) &&
            n.type === element.type,
        }
      );
    } else {
      // Use the existing block id
      blockId = element.id;
    }

    navigator.clipboard.writeText(`((${blockId}))`);
  }, [editor, element]);

  const onInsertBreak = useCallback(() => {
    // Insert new paragraph below as break
    // FIXME: after table
    const path = ReactEditor.findPath(editor, element);
    const location = Editor.after(editor, path, { unit: 'line', voids: true });
    Transforms.insertNodes(
      editor,
      {
        id: createNodeId(),
        type: ElementType.Paragraph,
        children: [{ text: '' }],
      },
      { at: location ?? Editor.end(editor, []) }
    );
  }, [editor, element]);

  const onInsertTable = useCallback((row: number, col: number) => {
    // Insert table below
    const path = ReactEditor.findPath(editor, element);
    const location = Editor.after(editor, path, { unit: 'line', voids: true });
    Transforms.insertNodes(
      editor,
      buildTable(row, col),
      { at: location ?? Editor.end(editor, []) }
    );
  }, [editor, element]);

  const onResizeTable = useCallback((row: number, col: number, path: Path) => {
    // resize Table
    Transforms.insertNodes(
      editor,
      [resizeTable(element as Table, row, col), {
        id: createNodeId(),
        type: ElementType.Paragraph,  // to reserve a block below table
        children: [{ text: '' }],
      }],
      { at: path ?? Editor.end(editor, []) }
    );
  }, [editor, element]);

  const onOperateTable = useCallback((row: number, col: number) => {
    const checkTable = element.type === ElementType.Table;
    // if current element is table, resize or delete
    if (checkTable) {
      const path = ReactEditor.findPath(editor, element);
      // delete first
      Transforms.removeNodes(editor, { at: path });
      // or resize
      if (row > 0 && col > 0) { 
        onResizeTable(row, col, path); 
      }
    // otherwise insert table below
    } else if (row > 0 && col > 0) {
      onInsertTable(row, col);
    }
    setIsTableModalOpen(false);
  }, [editor, element, onInsertTable, onResizeTable]);

  const onTableClick = useCallback(() => {
    setIsTableModalOpen(true)
  }, []);

  const buttonChildren = useMemo(
    () => (
      <span className="flex items-center justify-center w-6 h-6">
        <IconDotsVertical
          className="text-gray-500 dark:text-gray-400"
          size={18}
        />
      </span>
    ),
    []
  );

  const buttonClassName = useMemo(() => {
    const buttonClassName = `select-none hover:bg-gray-200 active:bg-gray-300 rounded absolute top-0.5 dark:hover:bg-gray-800 dark:active:bg-gray-700 ${className}`;
    if (element.type === ElementType.ListItem) {
      return `${buttonClassName} -left-14`;
    } else {
      return `${buttonClassName} -left-8`;
    }
  }, [element.type, className]);

  return (
    <>
    <Dropdown
      buttonChildren={buttonChildren}
      buttonClassName={buttonClassName}
      placement="left-start"
      offset={[0, 6]}
      tooltipContent={<span className="text-xs">Menu</span>}
      tooltipPlacement="bottom"
    >
      <DropdownOption
        format={ElementType.CheckListItem}
        element={element}
        Icon={IconListCheck}
        innerTxt="Checklist"
      />
      <DropdownOption
        format={ElementType.CodeBlock}
        element={element}
        Icon={IconBraces}
        innerTxt="Code Block"
      />
      <DropdownItem 
        onClick={onCopyBlockRef}
        className="flex items-center px-2 py-2 cursor-pointer rounded hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
      >
        <IconLink size={18} className="mr-1" />
        <span>Copy the Block</span>
      </DropdownItem>
      <DropdownItem 
        onClick={onTableClick}
        className={`${isWiki ? '' : 'hidden'} flex items-center px-2 py-2 cursor-pointer rounded hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600`}
      >
        <IconTable size={18} className="mr-1" />
        <span>{`${element.type === ElementType.Table ? 'Resize' : 'Insert'}  Table`}</span>
      </DropdownItem>
      <DropdownItem 
        onClick={onInsertBreak}
        className="flex items-center px-2 py-2 cursor-pointer rounded hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
      >
        <IconPrompt size={18} className="mr-1" />
        <span>Insert a Break</span>
      </DropdownItem>
      <ChangeBlockOptions
        element={element}
        className="border-t dark:border-gray-700"
        optOuts= {["p", "img", "cl", "code"]}
      />
    </Dropdown>
    {isTableModalOpen ? (
      <Portal>
        <TableModal
          setIsOpen={setIsTableModalOpen}
          onOperate={onOperateTable}
          rows={(element as Table)?.rows ?? null}
          columns={(element as Table)?.columns ?? null}
        />
      </Portal>
    ) : null}
    </>
  );
}

// Dropdown menu option: to make some input easier like checklist, code 
type DropdownOptionProps = {
  format: ElementType;
  element: Element;
  Icon: TablerIcon;
  innerTxt?: string;
  className?: string;
};

const DropdownOption = ({
  format,
  element,
  Icon,
  innerTxt,
  className = '',
}: DropdownOptionProps) => {
  const editor = useSlate();
  const path = useMemo(
    () => ReactEditor.findPath(editor, element),
    [editor, element]
  );
  const isActive = isElementActive(editor, format, path);

  return (
    <DropdownItem
      className={`flex items-center px-2 py-2 cursor-pointer rounded hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 ${className}`}
      onClick={() => toggleElement(editor, format, path, element)}
    >
      <Icon
        size={18}
        className={`mr-1 ${isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-800 dark:text-gray-200'}`}
      />
      <span>{innerTxt}</span>
    </DropdownItem>
  );
};
