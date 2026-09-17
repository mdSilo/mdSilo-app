import { findParentNode } from "prosemirror-utils";
import React from "react";
import { slashMenuItems } from "./menus/slash";
import { SlashMenuItem } from "./SlashMenuItem";
import CommandMenu, { Props } from "./CommandMenu";

type SlashMenuProps = Omit<
  Props,
  "renderMenuItem" | "items" | "onClearSearch"
> &
  Required<Pick<Props, "onLinkToolbarOpen" | "embeds">>;

export function SlashMenu(props: SlashMenuProps) {
  const clearSearch = () => {
    const { state, dispatch } = props.view;
    const parent = findParentNode((node) => !!node)(state.selection);

    if (parent) {
      // console.log("parentNode", parent.pos, state.selection.to, parent, state.selection)
      dispatch(
        state.tr.insertText("", parent.pos, props.isSlash ? state.selection.to : parent.pos)
      );
    }
  };

  return (
    <CommandMenu
      {...props}
      filterable={true}
      onClearSearch={clearSearch}
      renderMenuItem={(item, _index, options) => {
        return (
          <SlashMenuItem
            onClick={options.onClick} // src/components/CommandMenu.tsx#L546
            selected={options.selected}
            icon={item.icon}
            title={item.title}
            shortcut={item.shortcut}
          />
        );
      }}
      items={slashMenuItems(props.dictionary)}
    />
  );
}
