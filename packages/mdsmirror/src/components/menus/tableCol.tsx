import {TbTrash, TbAlignLeft, TbAlignRight, TbAlignCenter } from "react-icons/tb";
import { FaTableColumns } from "react-icons/fa6";
import { ImSortAmountAsc, ImSortAmountDesc } from "react-icons/im";
import { AiOutlineMergeCells, AiOutlineSplitCells } from "react-icons/ai";
import { EditorState } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import isNodeActive from "../../core/queries/isNodeActive";
import { isMergedCellSelection, isMultipleCellSelection } from "../../core/queries/table";
import { MenuItem } from "../types";
import { baseDictionary } from "../../dictionary";

export default function tableColMenuItems(
  state: EditorState,
  index: number,
  dictionary: typeof baseDictionary
): MenuItem[] {
  const { schema, selection } = state;

  if (!(selection instanceof CellSelection)) {
    return [];
  }

  return [
    {
      name: "setColumnAttr",
      tooltip: dictionary.alignLeft,
      icon: TbAlignLeft,
      attrs: { index, alignment: "left" },
      active: isNodeActive(schema.nodes.th, {
        colspan: 1,
        rowspan: 1,
        alignment: "left",
      }),
    },
    {
      name: "setColumnAttr",
      tooltip: dictionary.alignCenter,
      icon: TbAlignCenter,
      attrs: { index, alignment: "center" },
      active: isNodeActive(schema.nodes.th, {
        colspan: 1,
        rowspan: 1,
        alignment: "center",
      }),
    },
    {
      name: "setColumnAttr",
      tooltip: dictionary.alignRight,
      icon: TbAlignRight,
      attrs: { index, alignment: "right" },
      active: isNodeActive(schema.nodes.th, {
        colspan: 1,
        rowspan: 1,
        alignment: "right",
      }),
    },
    {
      name: "sortTable",
      tooltip: dictionary.sortAsc,
      attrs: { index, direction: "asc" },
      icon: ImSortAmountAsc,
    },
    {
      name: "sortTable",
      tooltip: dictionary.sortDesc,
      attrs: { index, direction: "desc" },
      icon: ImSortAmountDesc,
    },
    {
      name: "toggleHeaderColumn",
      tooltip: dictionary.toggleHeader,
      icon: FaTableColumns,
      visible: index === 0,
    },
    {
      name: "mergeCells",
      tooltip: dictionary.mergeCells,
      icon: AiOutlineMergeCells,
      visible: isMultipleCellSelection(state),
    },
    {
      name: "splitCell",
      tooltip: dictionary.splitCell,
      icon: AiOutlineSplitCells,
      visible: isMergedCellSelection(state),
    },
    {
      name: "separator",
    },
    {
      name: "deleteColumn",
      tooltip: dictionary.deleteColumn,
      icon: TbTrash,
      active: () => false,
    },
  ];
}
