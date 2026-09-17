import {
  TbBlockquote,
  TbList,
  TbBraces,
  TbMath,
  TbH1,
  TbH2,
  TbH3,
  TbSeparator,
  TbListNumbers,
  TbPageBreak,
  TbPaperclip,
  TbTable,
  TbListCheck,
  TbPhoto,
  TbBulb,
  TbAlertTriangle,
  TbInfoCircle,
  TbLink,
  TbCalendar,
  TbClock,
  TbAlarm,
} from "react-icons/tb";
import { MenuItem } from "../types";
import { baseDictionary } from "../../dictionary";

const SSR = typeof window === "undefined";
const isMac = !SSR && window.navigator.platform === "MacIntel";
const mod = isMac ? "⌘" : "ctrl";

export function slashMenuItems(
  dictionary: typeof baseDictionary,
  isSlash = true,
): MenuItem[] {
  return isSlash ? [
    {
      name: "image",
      title: dictionary.image,
      icon: TbPhoto,
      keywords: "picture photo",
    },
    {
      name: "attachment",
      title: dictionary.file,
      icon: TbPaperclip,
      keywords: "file upload attach",
    },
    {
      name: "separator",
    },
    {
      name: "date",
      title: dictionary.insertDate,
      keywords: "clock",
      icon: TbCalendar,
    },
    {
      name: "time",
      title: dictionary.insertTime,
      keywords: "clock",
      icon: TbClock,
    },
    {
      name: "now",
      title: dictionary.insertDateTime,
      keywords: "clock",
      icon: TbAlarm,
    },
    {
      name: "separator",
    },
    {
      name: "heading",
      title: dictionary.h1,
      keywords: "h1 heading1 title",
      icon: TbH1,
      shortcut: "^ 1",
      attrs: { level: 1 },
    },
    {
      name: "heading",
      title: dictionary.h2,
      keywords: "h2 heading2",
      icon: TbH2,
      shortcut: "^ 2",
      attrs: { level: 2 },
    },
    {
      name: "heading",
      title: dictionary.h3,
      keywords: "h3 heading3",
      icon: TbH3,
      shortcut: "^ 3",
      attrs: { level: 3 },
    },
    {
      name: "separator",
    },
    {
      name: "checkbox_list",
      title: dictionary.checkboxList,
      icon: TbListCheck,
      keywords: "checklist checkbox task",
      shortcut: "^ 7",
    },
    {
      name: "bullet_list",
      title: dictionary.bulletList,
      icon: TbList,
      shortcut: "^ 8",
    },
    {
      name: "ordered_list",
      title: dictionary.orderedList,
      icon: TbListNumbers,
      shortcut: "^ 9",
    },
    {
      name: "separator",
    },
    {
      name: "link",
      title: dictionary.link,
      icon: TbLink,
      shortcut: `${mod} k`,
      keywords: "link url uri href",
    },
    {
      name: "table",
      title: dictionary.table,
      icon: TbTable,
      shortcut: `${mod} shift space`,
      attrs: { rowsCount: 3, colsCount: 3 },
    },
    {
      name: "blockquote",
      title: dictionary.quote,
      icon: TbBlockquote,
      shortcut: `>`,
    },
    {
      name: "code_block",
      title: dictionary.codeBlock,
      icon: TbBraces,
      shortcut: "```",
      keywords: "script",
    },
    {
      name: "math_inline",
      title: dictionary.math,
      icon: TbMath,
      shortcut: "$$",
      keywords: "math equation",
    },
    {
      name: "hr",
      title: dictionary.hr,
      icon: TbSeparator,
      shortcut: `---`,
      keywords: "horizontal rule break line",
    },
    {
      name: "hr",
      title: dictionary.pageBreak,
      icon: TbPageBreak,
      keywords: "page print break line",
      attrs: { markup: "***" },
    },
    {
      name: "separator",
    },
    {
      name: "container_notice",
      title: dictionary.infoNotice,
      icon: TbInfoCircle,
      shortcut: `:::`,
      keywords: "notice card information",
      attrs: { style: "info" },
    },
    {
      name: "container_notice",
      title: dictionary.warningNotice,
      icon: TbAlertTriangle,
      shortcut: `:::`,
      keywords: "notice card error",
      attrs: { style: "warning" },
    },
    {
      name: "container_notice",
      title: dictionary.tipNotice,
      icon: TbBulb,
      shortcut: `:::`,
      keywords: "notice card suggestion",
      attrs: { style: "tip" },
    },
  ] : [];
}
