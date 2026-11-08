import copy from "copy-to-clipboard";
import { some } from "lodash";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProsemirrorNode } from "prosemirror-model";
import { CellSelection } from "prosemirror-tables";
import * as React from "react";
import styled from "styled-components";
import { TbPuzzle } from "react-icons/tb";
import createAndInsertLink from "../core/commands/createAndInsertLink";
import { CommandFactory } from "../core/Extension";
import type { MarkdownSerializer } from "../core/mdSerializer";
import { getColumnIndex, getRowIndex } from "../core/queries/table";
import getMarkRange from "../core/queries/getMarkRange";
import { isMarkActive } from "../core/queries/isMarkActive";
import isNodeActive from "../core/queries/isNodeActive";
import { MenuItem } from "./types";
import { baseDictionary } from "../dictionary";
import { ToastType } from "../types";
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

// the items the toolbar does itself, not commands of the editor
const TOOLBAR_ACTIONS = ["search", "copy", "issue", "lookup"];

/** What an action on the text selected does to it: put text in its place, or after it */
export type SelectionActionResult = {
  /** text in place of the text selected */
  replace?: string;
  /** text after the text selected */
  insert?: string;
  /** Markdown after the block of the text selected, e.g. an image */
  insertMarkdown?: string;
};

/** What else is known of the text selected, for an action on it */
export type SelectionInfo = {
  /** the text selected as Markdown, if the editor has a serializer */
  markdown?: string;
};

/**
 * An action on the text selected, given by the app, e.g. of a plugin: all
 * of them in a list under one button of the toolbar
 */
export type SelectionAction = {
  id: string;
  title: string;
  /** the URL of its icon, e.g. of its plugin; a puzzle piece otherwise */
  icon?: string;
  /** who it is of, shown smaller beside it: the name of its plugin */
  group?: string;
  run: (
    text: string,
    info: SelectionInfo
  ) => Promise<SelectionActionResult | undefined | void>;
};

/** the button of the list of the actions */
const ACTIONS_MENU = "action:menu";

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
  /** make an issue of the text selected; the link to it goes after the text */
  onCreateIssue?: (
    text: string
  ) => Promise<{ title: string; href: string } | undefined>;
  /**
   * look the text selected up, e.g. in dictionaries: at its range in the
   * page, clear of the toolbar (its box given)
   */
  onLookUpText?: (text: string, range?: Range, toolbar?: DOMRect) => void;
  /** the text selected can be looked up: a word or a few; any if not given */
  canLookUpText?: (text: string) => boolean;
  onOpenLink?: (href: string) => void;
  onShowToast?: (msg: string, code: string) => void;
  selectionActions?: SelectionAction[];
  /** to give actions the text selected as Markdown */
  serializer?: MarkdownSerializer;
  /** to put the Markdown of an action in the note */
  parseMarkdown?: (markdown: string) => ProsemirrorNode;
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

export default class SelectionToolbar extends React.Component<
  Props,
  { actionsOpen: boolean; running: boolean }
> {
  isActive = false;
  menuRef = React.createRef<HTMLDivElement>();
  // running: an action on the text, maybe with its answer in a dialog of the
  // app, which the toolbar (above all) would cover
  state = { actionsOpen: false, running: false };

  componentDidUpdate(): void {
    const visible = isVisible(this.props);
    if (this.isActive && !visible) {
      this.isActive = false;
      if (this.state.actionsOpen) this.setState({ actionsOpen: false });
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

    // a click in the editor sets the selection itself. The editor may have
    // lost the focus on this click: clicking a link without href opens the
    // link editor, which focuses its input, so do not reset the selection
    if (ev.target instanceof Node && view.dom.contains(ev.target)) {
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

  handleCreateIssue = async (text: string) => {
    const { view, onCreateIssue } = this.props;
    const issue = await onCreateIssue?.(text);
    if (!issue) return;
    // the link right after the text, where it is now
    const { state, dispatch } = view;
    const at = Math.min(state.selection.to, state.doc.content.size);
    const label = ` ${issue.title}`;
    dispatch(
      state.tr
        .insertText(label, at)
        .addMark(
          at + 1,
          at + label.length,
          state.schema.marks.link.create({ href: issue.href })
        )
    );
  };

  /** Runs the action on the text, then puts its answer where the text is now. */
  handleSelectionAction = async (action: SelectionAction, text: string) => {
    const { view, onShowToast, serializer } = this.props;
    const { state: before } = view;
    const info: SelectionInfo = {};
    if (serializer) {
      const { from, to } = before.selection;
      info.markdown = serializer.serialize(before.doc.cut(from, to)).trim();
    }
    let result: SelectionActionResult | undefined | void;
    this.setState({ running: true });
    try {
      result = await action.run(text, info);
    } catch (e) {
      onShowToast?.(
        `${action.title}: ${(e as Error)?.message ?? e}`,
        ToastType.Error
      );
      return;
    } finally {
      this.setState({ running: false });
    }
    if (!result) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection;
    // the text selected changed meanwhile: nothing to replace
    if (state.doc.textBetween(from, to) !== text) return;
    if (typeof result.replace === "string") {
      dispatch(state.tr.insertText(result.replace, from, to));
    } else if (typeof result.insert === "string") {
      dispatch(state.tr.insertText(` ${result.insert}`, to));
    } else if (
      typeof result.insertMarkdown === "string" &&
      this.props.parseMarkdown
    ) {
      const $to = state.doc.resolve(to);
      // after the block, in what holds it (a list item, a quote...)
      const at = $to.depth ? $to.after() : to;
      try {
        const blocks = this.props.parseMarkdown(result.insertMarkdown);
        dispatch(state.tr.insert(at, blocks.content));
      } catch (e) {
        onShowToast?.(
          `${action.title}: ${(e as Error)?.message ?? e}`,
          ToastType.Error
        );
      }
    }
  };

  render() {
    const {
      dictionary,
      onCreateLink,
      onSearchSelectText,
      onCreateIssue,
      onLookUpText,
      canLookUpText,
      selectionActions,
      isTemplate,
      rtl,
      ...rest
    } = this.props;
    const { view } = rest;
    const { state } = view;
    const { selection } = state;

    const isCodeSelection =
      isNodeActive(state.schema.nodes.code_block)(state) ||
      (!!state.schema.nodes.comment &&
        isNodeActive(state.schema.nodes.comment)(state));
    // toolbar is disabled in code blocks and comments, no bold / italic etc
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
      selection instanceof NodeSelection &&
      selection.node.type.name === "image";
    const isDividerSelection = isNodeActive(state.schema.nodes.hr)(state);

    const selectionText = state.doc.cut(
      state.selection.from,
      state.selection.to
    ).textContent;

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
      items = getFormattingMenuItems(
        state,
        isTemplate,
        dictionary,
        !!onCreateIssue,
        !!onLookUpText &&
          !!selectionText.trim() &&
          (canLookUpText?.(selectionText) ?? true)
      );
      if (selectionActions?.length) {
        items.push(
          { name: "separator" },
          {
            name: ACTIONS_MENU,
            tooltip: dictionary.plugins,
            icon: TbPuzzle,
            active: () => this.state.actionsOpen,
          }
        );
      }
      isTextSelection = true;
    }

    // Some extensions may be disabled, remove corresponding items
    items = items.filter((item) => {
      if (item.name === "separator") {
        return true;
      }
      if (
        item.name &&
        (TOOLBAR_ACTIONS.includes(item.name) || item.name.startsWith("action:"))
      ) {
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

    if (isTextSelection && !selectionText && !isLink) {
      return null;
    }

    const actions: Record<string, () => void> = {
      search: () => onSearchSelectText?.(selectionText),
      copy: () => {
        // the blocks apart, as copied from the page
        copy(state.doc.textBetween(selection.from, selection.to, "\n\n"), {
          format: "text/plain",
        });
        rest.onShowToast?.(dictionary.copied, ToastType.Info);
      },
      issue: () => void this.handleCreateIssue(selectionText),
      lookup: () =>
        onLookUpText?.(
          selectionText,
          rangeOfSelection(view),
          this.menuRef.current?.getBoundingClientRect()
        ),
    };
    actions[ACTIONS_MENU] = () =>
      this.setState(({ actionsOpen }) => ({ actionsOpen: !actionsOpen }));

    return (
      <FloatingToolbar
        view={view}
        active={isVisible(this.props) && !this.state.running}
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
          <ToolbarMenu items={items} actions={actions} {...rest} />
        )}
        {this.state.actionsOpen && selectionActions?.length && !isLink ? (
          <ActionsList role="menu">
            {selectionActions.map((action) => (
              <ActionItem
                key={action.id}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  this.setState({ actionsOpen: false });
                  void this.handleSelectionAction(action, selectionText);
                }}
              >
                {action.icon ? (
                  <img src={action.icon} alt="" width={16} height={16} />
                ) : (
                  <TbPuzzle size={16} />
                )}
                <span className="title">{action.title}</span>
                {action.group ? (
                  <span className="group">{action.group}</span>
                ) : null}
              </ActionItem>
            ))}
          </ActionsList>
        ) : null}
      </FloatingToolbar>
    );
  }
}

/** The range of the text selected in the page, if the editor shows it. */
function rangeOfSelection(view: EditorView): Range | undefined {
  try {
    const { from, to } = view.state.selection;
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return undefined;
  }
}

/** The actions on the text selected: above the toolbar, clear of the text */
const ActionsList = styled.div`
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  min-width: 200px;
  max-width: 320px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 6px;
  line-height: normal;
  white-space: normal;
  pointer-events: auto;
  background-color: ${(props) => props.theme.toolbarBackground};
  color: ${(props) => props.theme.toolbarItem};
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
`;

const ActionItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background-color: rgba(255, 255, 255, 0.12);
    outline: none;
  }

  img,
  svg {
    flex-shrink: 0;
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group {
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    opacity: 0.6;
  }
`;
