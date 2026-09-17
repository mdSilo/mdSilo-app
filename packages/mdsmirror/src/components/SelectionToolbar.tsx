import { some } from "lodash";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { CellSelection } from "prosemirror-tables";
import * as React from "react";
import createAndInsertLink from "../core/commands/createAndInsertLink";
import { CommandFactory } from "../core/Extension";
import { getColumnIndex, getRowIndex } from "../core/queries/table";
import getMarkRange from "../core/queries/getMarkRange";
import { isMarkActive } from "../core/queries/isMarkActive";
import isNodeActive from "../core/queries/isNodeActive";
import { MenuItem } from "./types";
import { baseDictionary } from "../dictionary";
import filterExcessSeparators from "./filterExcessSeparators";
import getDividerMenuItems from "./menus/divider";
import getFormattingMenuItems from "./menus/formatting";
import getImageMenuItems from "./menus/image";
import getTableMenuItems from "./menus/table";
import getTableColMenuItems from "./menus/tableCol";
import getTableRowMenuItems from "./menus/tableRow";
import getTableCellMenuItems from "./menus/tableCell";
import FloatingToolbar from "./FloatingToolbar";
import LinkEditor, { SearchResult } from "./LinkEditor";
import ToolbarMenu from "./ToolbarMenu";

type Props = {
  dictionary: typeof baseDictionary;
  rtl: boolean;
  isTemplate: boolean;
  commands: Record<string, CommandFactory>;
  onOpen: () => void;
  onClose: () => void;
  onSearchLink?: (term: string) => Promise<SearchResult[]>;
  onCreateLink?: (title: string) => Promise<string>;
  onSearchSelectText?: (txt: string) => void;
  onOpenLink?: (href: string) => void;
  onShowToast?: (msg: string, code: string) => void;
  view: EditorView;
};

function isVisible(props: Props) {
  const { view } = props;
  const { selection } = view.state;

  if (isMarkActive(view.state.schema.marks.link)(view.state)) {
    return true;
  }
  if (!selection || selection.empty) {
    return false;
  }
  if (selection instanceof NodeSelection && selection.node.type.name === "hr") {
    return true;
  }
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "image"
  ) {
    return true;
  }
  if (selection instanceof NodeSelection) {
    return false;
  }

  const slice = selection.content();
  const fragment = slice.content;
  const nodes = (fragment as any).content;

  return some(nodes, (n) => n.content.size);
}

export default class SelectionToolbar extends React.Component<Props> {
  isActive = false;
  menuRef = React.createRef<HTMLDivElement>();

  componentDidUpdate(): void {
    const visible = isVisible(this.props);
    if (this.isActive && !visible) {
      this.isActive = false;
      this.props.onClose();
    }
    if (!this.isActive && visible) {
      this.isActive = true;
      this.props.onOpen();
    }
  }

  componentDidMount(): void {
    window.addEventListener("mouseup", this.handleClickOutside);
  }

  componentWillUnmount(): void {
    window.removeEventListener("mouseup", this.handleClickOutside);
  }

  handleClickOutside = (ev: MouseEvent): void => {
    if (
      ev.target instanceof HTMLElement &&
      this.menuRef.current &&
      this.menuRef.current.contains(ev.target)
    ) {
      return;
    }

    if (!this.isActive) {
      return;
    }

    const { view } = this.props;
    if (view.hasFocus()) {
      return;
    }

    const { dispatch } = view;

    dispatch(
      view.state.tr.setSelection(new TextSelection(view.state.doc.resolve(0)))
    );
  };

  handleOnCreateLink = async (title: string): Promise<void> => {
    const { dictionary, onCreateLink, view, onShowToast } = this.props;

    if (!onCreateLink) {
      return;
    }

    const { dispatch, state } = view;
    const { from, to } = state.selection;
    if (from === to) {
      // selection cannot be collapsed
      return;
    }

    const href = `creating#${title}…`;
    const markType = state.schema.marks.link;

    // Insert a placeholder link
    dispatch(
      view.state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, markType.create({ href }))
    );

    createAndInsertLink(view, title, href, {
      onCreateLink,
      onShowToast,
      dictionary,
    });
  };

  handleOnSelectLink = ({
    href,
    from,
    to,
  }: {
    href: string;
    from: number;
    to: number;
  }): void => {
    const { view } = this.props;
    const { state, dispatch } = view;

    const markType = state.schema.marks.link;

    dispatch(
      state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, markType.create({ href }))
    );
  };

  render() {
    const { 
      dictionary, onCreateLink, onSearchSelectText, isTemplate, rtl, ...rest 
    } = this.props;
    const { view } = rest;
    const { state } = view;
    const { selection } = state;

    const isCodeSelection = isNodeActive(state.schema.nodes.code_block)(state);
    // toolbar is disabled in code blocks, no bold / italic etc
    if (isCodeSelection) {
      return null;
    }

    const colIndex = getColumnIndex(state);
    const rowIndex = getRowIndex(state);
    const isTableSelection = colIndex !== undefined && rowIndex !== undefined;
    const isCellSelection = selection instanceof CellSelection;
    const isLink = isMarkActive(state.schema.marks.link)(state);
    const linkRange = getMarkRange(selection.$from, state.schema.marks.link);
    const isImageSelection = 
      selection instanceof NodeSelection && selection.node.type.name === "image";
    const isDividerSelection = isNodeActive(state.schema.nodes.hr)(state);

    let isTextSelection = false;

    let items: MenuItem[] = [];
    if (isTableSelection) {
      items = getTableMenuItems(state, dictionary);
    } else if (colIndex !== undefined) {
      items = getTableColMenuItems(state, colIndex, dictionary);
    } else if (rowIndex !== undefined) {
      items = getTableRowMenuItems(state, rowIndex, dictionary);
    } else if (isCellSelection) {
      items = getTableCellMenuItems(state, dictionary);
    } else if (isImageSelection) {
      items = getImageMenuItems(state, dictionary);
    } else if (isDividerSelection) {
      items = getDividerMenuItems(state, dictionary);
    } else {
      items = getFormattingMenuItems(state, isTemplate, dictionary);
      isTextSelection = true;
    }

    // Some extensions may be disabled, remove corresponding items
    items = items.filter((item) => {
      if (item.name === "separator") {
        return true;
      }
      if (item.name === "search") {
        return true;
      }
      if (item.name && !this.props.commands[item.name]) {
        return false;
      }
      return true;
    });

    items = filterExcessSeparators(items);
    if (!items.length) {
      return null;
    }

    const selectionText = state.doc.cut(
      state.selection.from,
      state.selection.to
    ).textContent;

    if (isTextSelection && !selectionText && !isLink) {
      return null;
    }

    const onSearchText = () => {
      onSearchSelectText 
        ? onSearchSelectText(selectionText)  
        : console.log(selectionText) 
    };

    return (
      <FloatingToolbar
        view={view}
        active={isVisible(this.props)}
        ref={this.menuRef}
      >
        {isLink && linkRange ? (
          <LinkEditor
            dictionary={dictionary}
            mark={linkRange.mark}
            from={linkRange.from}
            to={linkRange.to}
            onCreateLink={onCreateLink ? this.handleOnCreateLink : undefined}
            onSelectLink={this.handleOnSelectLink}
            {...rest}
          />
        ) : (
          <ToolbarMenu items={items} onSearch={onSearchText} {...rest} />
        )}
      </FloatingToolbar>
    );
  }
}
