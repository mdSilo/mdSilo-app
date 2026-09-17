import { Node as ProsemirrorNode } from "prosemirror-model";
import { Transaction } from "prosemirror-state";

export type ComponentProps = {
  theme: any;
  node: ProsemirrorNode;
  isSelected: boolean;
  isEditable: boolean;
  getPos: () => number;
};

export enum ToastType {
  Error = "error",
  Info = "info",
}

export type Dispatch = (tr: Transaction) => void;
