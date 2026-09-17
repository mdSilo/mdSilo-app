import { EditorState } from "prosemirror-state";
import { TbPageBreak, TbSeparator } from "react-icons/tb";
import isNodeActive from "../../core/queries/isNodeActive";
import { MenuItem } from "../types";
import { baseDictionary } from "../../dictionary";

export default function dividerMenuItems(
  state: EditorState,
  dictionary: typeof baseDictionary
): MenuItem[] {
  const { schema } = state;

  return [
    {
      name: "hr",
      tooltip: dictionary.pageBreak,
      attrs: { markup: "***" },
      active: isNodeActive(schema.nodes.hr, { markup: "***" }),
      icon: TbPageBreak,
    },
    {
      name: "hr",
      tooltip: dictionary.hr,
      attrs: { markup: "---" },
      active: isNodeActive(schema.nodes.hr, { markup: "---" }),
      icon: TbSeparator,
    },
  ];
}
