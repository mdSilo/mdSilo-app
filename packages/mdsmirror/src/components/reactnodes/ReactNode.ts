import { ComponentProps } from "../types";
import Node from "../../nodes/Node";

export default abstract class ReactNode extends Node {
  abstract component({
    node,
    isSelected,
    isEditable,
    //innerRef,
  }: Omit<ComponentProps, "theme">): React.ReactElement;
}
