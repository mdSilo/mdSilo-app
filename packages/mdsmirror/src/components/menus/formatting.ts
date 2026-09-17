import { 
  TbBold, TbCode, TbItalic, TbLink, TbPaint, TbSearch, TbStrikethrough, TbUnderline, TbWriting 
} from "react-icons/tb";
import { EditorState } from "prosemirror-state";
import { isMarkActive } from "../../core/queries/isMarkActive";
import { MenuItem } from "../types";
import { baseDictionary} from "../../dictionary";

export default function formattingMenuItems(
  state: EditorState,
  isTemplate: boolean,
  dictionary: typeof baseDictionary
): MenuItem[] {
  const { schema } = state;

  return [
    {
      name: "placeholder",
      tooltip: dictionary.placeholder,
      icon: TbWriting,
      active: isMarkActive(schema.marks.placeholder),
      visible: isTemplate,
    },
    {
      name: "separator",
      visible: isTemplate,
    },
    {
      name: "link",
      tooltip: dictionary.createLink,
      icon: TbLink,
      active: isMarkActive(schema.marks.link),
      attrs: { href: "" },
    },
    {
      name: "separator",
    },
    {
      name: "strong",
      tooltip: dictionary.strong,
      icon: TbBold,
      active: isMarkActive(schema.marks.strong),
    },
    {
      name: "highlight",
      tooltip: dictionary.mark,
      icon: TbPaint,
      active: isMarkActive(schema.marks.highlight),
    },
    {
      name: "em",
      tooltip: dictionary.mark,
      icon: TbItalic,
      active: isMarkActive(schema.marks.em),
    },
    {
      name: "underline",
      tooltip: dictionary.mark,
      icon: TbUnderline,
      active: isMarkActive(schema.marks.underline),
    },
    {
      name: "strikethrough",
      tooltip: dictionary.strikethrough,
      icon: TbStrikethrough,
      active: isMarkActive(schema.marks.strikethrough),
    },
    {
      name: "code_inline",
      tooltip: dictionary.codeInline,
      icon: TbCode,
      active: isMarkActive(schema.marks.code_inline),
    },
    {
      name: "separator",
    },
    {
      name: "search",
      tooltip: dictionary.searchText,
      icon: TbSearch,
    }
  ];
}
