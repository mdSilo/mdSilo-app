import { Editor, Range, Point, Element as SlateElement } from 'slate';
import { ElementType, Table, TableCell, TableRow, MsElement } from 'editor/slate';
import { createNodeId } from './withNodeId';

export const buildTable = (row = 4, col = 4): MsElement[] => {
  if (row < 1 || col < 1) {
    return [];
  }
  const children: TableRow[] = [];
  for (let i = 0; i < row; i++) {
    const subChildren: TableCell[] = [];
    for (let j = 0; j < col; j++) {
      const subChild: TableCell = {
        id: createNodeId(),
        type: ElementType.TableCell,
        children: [{ text: `${i}-${j}` }],
      };
      subChildren.push(subChild);
    }
    const child: TableRow = {
      id: createNodeId(),
      type: ElementType.TableRow,
      children: subChildren,
    };
    children.push(child);
  }
  
  return [
    {
      id: createNodeId(),
      type: ElementType.Table,
      rows: row,
      columns: col,
      children: children,
    },
    {
      id: createNodeId(),
      type: ElementType.Paragraph,  // to reserve a block below table
      children: [{ text: '' }],
    },
  ];
}

export const resizeTable = (table: Table, row = 0, col = 0): Table => {
  const oldRow = table.rows;
  const oldCol = table.columns;
  if ((row === oldRow && col === oldCol) || (row <= 0 && col <= 0)) {
    return table;
  }
  const subCol = col - oldCol;
  const subRow = row - oldRow;

  const children: TableRow[] = [...table.children];
  const newChildren: TableRow[] = [];
  for (const tr of children) {
    const subChildren: TableCell[] = [...tr.children];
    for (let j = 0; j < Math.abs(subCol); j++) {
      if (subCol > 0) { 
        const subChild: TableCell = {
          id: createNodeId(),
          type: ElementType.TableCell,
          children: [{ text: '' }],
        };
        subChildren.push(subChild);
      } else {
        subChildren.pop();
      }
    }
    const newTr: TableRow = {
      id: tr.id,
      type: ElementType.TableRow,
      children: subChildren,
    }
    newChildren.push(newTr);
  }

  for (let i = 0; i < Math.abs(subRow); i++) {
    if (subRow > 0) {
      const subChildren: TableCell[] = [];
      for (let j = 0; j < col; j++) {
        const subChild: TableCell = {
          id: createNodeId(),
          type: ElementType.TableCell,
          children: [{ text: '' }],
        };
        subChildren.push(subChild);
      }
      const child: TableRow = {
        id: createNodeId(),
        type: ElementType.TableRow,
        children: subChildren,
      };
      newChildren.push(child);
    } else {
      newChildren.pop();
    }
  }

  const newTable: Table = {
    id: table.id,
    type: ElementType.Table,
    rows: row,
    columns: col,
    children: newChildren,
  }

  return newTable;
}

const withTables = (editor: Editor) => {
  const { deleteForward } = editor;

  // merge override deleteBackward to withCustomDeleteBackward
  // merge override insertBreak to withBlockBreakout
  // here override deleteForward
  editor.deleteForward = (...args) => {
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          SlateElement.isElement(n) &&
          n.type === ElementType.TableCell,
      })

      if (cell) {
        const [, cellPath] = cell;
        const end = Editor.end(editor, cellPath);

        if (Point.equals(selection.anchor, end)) {
          return;
        }
      }
    }

    deleteForward(...args);
  } 

  return editor;
}

export default withTables;
