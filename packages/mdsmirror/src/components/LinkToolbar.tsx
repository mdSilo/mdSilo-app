import { EditorView } from "prosemirror-view";
import * as React from "react";
import createAndInsertLink from "../core/commands/createAndInsertLink";
import { baseDictionary } from "../dictionary";
import FloatingToolbar from "./FloatingToolbar";
import LinkEditor, { SearchResult } from "./LinkEditor";

type Props = {
  isActive: boolean;
  view: EditorView;
  dictionary: typeof baseDictionary;
  onCreateLink?: (title: string) => Promise<string>;
  onSearchLink?: (term: string) => Promise<SearchResult[]>;
  isRemoteSearch?: boolean;
  onSearchRemote?: (term: string) => Promise<SearchResult[]>;
  isHashTagSearch?: boolean;
  onSearchHashTag?: (term: string) => Promise<SearchResult[]>;
  onOpenLink?: (href: string) => void;
  showPreview?: boolean;
  onShowPreview?: (anchor: string) => string;
  onShowToast?: (msg: string, code: string) => void;
  onClose: () => void;
  searchTriggerOpen?: boolean;
  resetSearchTrigger?: () => void;
};

function isActive(props: Props) {
  const { view } = props;
  const { selection } = view.state;

  try {
    const paragraph = view.domAtPos(selection.from);
    return props.isActive && !!paragraph.node;
  } catch (err) {
    return false;
  }
}

export default class LinkToolbar extends React.Component<Props> {
  menuRef = React.createRef<HTMLDivElement>();

  state = {
    left: -1000,
    top: undefined,
  };

  componentDidMount() {
    window.addEventListener("mousedown", this.handleClickOutside);
  }

  componentWillUnmount() {
    window.removeEventListener("mousedown", this.handleClickOutside);
  }

  handleClickOutside = (event: Event) => {
    if (
      event.target instanceof HTMLElement &&
      this.menuRef.current &&
      this.menuRef.current.contains(event.target)
    ) {
      return;
    }

    this.props.onClose();
  };

  handleOnCreateLink = async (title: string) => {
    const { dictionary, onCreateLink, view, onClose, onShowToast } = this.props;

    onClose();
    this.props.view.focus();

    if (!onCreateLink) {
      return;
    }

    const { dispatch, state } = view;
    let { from, to } = state.selection;
    if (from !== to) {
      // selection must be collapsed
      return;
    }

    if (this.props.searchTriggerOpen) {
      this.props.resetSearchTrigger && this.props.resetSearchTrigger();
      dispatch(view.state.tr.delete(from - 2, from));
      from = from - 2;
      to = to - 2;
    }

    const href = `creating#${title}…`;

    // Insert a placeholder link
    dispatch(
      view.state.tr
        .insertText(title, from, to)
        .addMark(
          from,
          to + title.length,
          state.schema.marks.link.create({ href })
        )
    );

    createAndInsertLink(view, title, href, {
      onCreateLink,
      onShowToast,
      dictionary,
    });
  };

  // insert a link in style `[]()`
  handleOnSelectLink = ({
    href,
    title,
  }: {
    href: string;
    title: string;
    from: number;
    to: number;
  }) => {
    const { view, onClose } = this.props;

    onClose();
    this.props.view.focus();

    const { dispatch, state } = view;
    let { from, to } = state.selection;
    if (from !== to) {
      // selection must be collapsed
      return;
    }

    if (this.props.searchTriggerOpen) {
      this.props.resetSearchTrigger && this.props.resetSearchTrigger();
      dispatch(view.state.tr.delete(from - 2, from));
      from = from - 2;
      to = to - 2;
    }

    dispatch(
      view.state.tr
        .insertText(title, from, to)
        .addMark(
          from,
          to + title.length,
          state.schema.marks.link.create({ href })
        )
    );
  };

  render() {
    const { onCreateLink, onClose, ...rest } = this.props;
    const { selection } = this.props.view.state;
    const active = isActive(this.props);

    return (
      <FloatingToolbar ref={this.menuRef} active={active} {...rest}>
        {active && (
          <LinkEditor
            from={selection.from}
            to={selection.to}
            onCreateLink={onCreateLink ? this.handleOnCreateLink : undefined}
            onSelectLink={this.handleOnSelectLink}
            onRemoveLink={onClose}
            {...rest}
          />
        )}
      </FloatingToolbar>
    );
  }
}
