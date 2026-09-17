import { EditorState } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import { AiOutlineMergeCells, AiOutlineSplitCells } from "react-icons/ai";
import { baseDictionary } from "../../dictionary";
import { isMergedCellSelection, isMultipleCellSelection } from "../../core/queries/table";
import { MenuItem } from "../types";

export default function tableCellMenuItems(
  state: EditorState,
  dictionary: typeof baseDictionary,
): MenuItem[] {
  const { selection } = state;

  // Only show menu items if we have a CellSelection
  if (!(selection instanceof CellSelection)) {
    return [];
  }

  return [
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
  ];
}
