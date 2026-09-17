import { EditorView } from "prosemirror-view";
import * as React from "react";
import styled from "styled-components";
import { CommandFactory } from "../core/Extension";
import { MenuItem } from "./types";
import ToolbarButton from "./ToolbarButton";
import ToolbarSeparator from "./ToolbarSeparator";
import Tooltip from "./Tooltip";

type Props = {
  commands: Record<string, CommandFactory>;
  view: EditorView;
  items: MenuItem[];
  onSearch: () => void;
};

function ToolbarMenu(props: Props) {
  const { view, items, onSearch } = props;
  const { state } = view;

  return (
    <FlexibleWrapper>
      {items.map((item: MenuItem, index: number) => {
        if (item.name === "separator" && item.visible !== false) {
          return <ToolbarSeparator key={index} />;
        }
        if (item.visible === false || !item.icon) {
          return null;
        }
        const Icon = item.icon;
        const isActive = item.active ? item.active(state) : false;

        return (
          <Tooltip tooltip={item.tooltip || ''} key={index}>
            <ToolbarButton
              onClick={() => {
                const name = item.name;
                if (name === 'search') {
                  onSearch();
                } else {
                  name && props.commands[name](item.attrs);
                }
              }}
              active={isActive}
            >
              <Icon color="currentColor" />
            </ToolbarButton>
          </Tooltip>
        );
      })}
    </FlexibleWrapper>
  );
}

export default ToolbarMenu;

const FlexibleWrapper = styled.div`
  color: ${(props) => props.theme.toolbarItem};
  display: flex;
  gap: 8px;
`;
