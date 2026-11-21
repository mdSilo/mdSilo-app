import {
  TbTrash,
  TbDownload,
  TbReplace,
  TbLayoutAlignLeft,
  TbLayoutAlignRight,
  TbLayoutAlignCenter,
  TbPencil,
} from "react-icons/tb";
import { EditorState } from "prosemirror-state";
import isNodeActive from "../../core/queries/isNodeActive";
import { MenuItem } from "../types";
import { baseDictionary } from "../../dictionary";

export default function imageMenuItems(
  state: EditorState,
  dictionary: typeof baseDictionary,
  /** the image can be edited: a drawing */
  editable = false
): MenuItem[] {
  const { schema } = state;
  const isLeftAligned = isNodeActive(schema.nodes.image, {
    layoutClass: "left-50",
  });
  const isRightAligned = isNodeActive(schema.nodes.image, {
    layoutClass: "right-50",
  });

  return [
    {
      name: "editImage",
      tooltip: dictionary.editImage,
      icon: TbPencil,
      visible: editable,
      active: () => false,
    },
    {
      name: "separator",
      visible: editable,
    },
    {
      name: "alignLeft",
      tooltip: dictionary.alignLeft,
      icon: TbLayoutAlignLeft,
      visible: true,
      active: isLeftAligned,
    },
    {
      name: "alignCenter",
      tooltip: dictionary.alignCenter,
      icon: TbLayoutAlignCenter,
      visible: true,
      active: (state) =>
        isNodeActive(schema.nodes.image)(state) &&
        !isLeftAligned(state) &&
        !isRightAligned(state),
    },
    {
      name: "alignRight",
      tooltip: dictionary.alignRight,
      icon: TbLayoutAlignRight,
      visible: true,
      active: isRightAligned,
    },
    {
      name: "separator",
      visible: true,
    },
    {
      name: "downloadImage",
      tooltip: dictionary.downloadImage,
      icon: TbDownload,
      visible: !!fetch,
      active: () => false,
    },
    {
      name: "replaceImage",
      tooltip: dictionary.replaceImage,
      icon: TbReplace,
      visible: true,
      active: () => false,
    },
    {
      name: "deleteImage",
      tooltip: dictionary.deleteImage,
      icon: TbTrash,
      visible: true,
      active: () => false,
    },
  ];
}
