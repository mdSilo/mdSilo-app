import * as React from "react";
import { EditorState } from "prosemirror-state";
import { IconType } from "react-icons";

export { ComponentProps } from "../types";

export type MenuItem = {
  icon?: IconType;
  name?: string;
  title?: string;
  shortcut?: string;
  keywords?: string;
  tooltip?: string;
  defaultHidden?: boolean;
  attrs?: Record<string, any>;
  visible?: boolean;
  active?: (state: EditorState) => boolean;
};

export type EmbedDescriptor = MenuItem & {
  matcher: (url: string) => boolean | [] | RegExpMatchArray;
  component: typeof React.Component | React.FC<any>;
};
