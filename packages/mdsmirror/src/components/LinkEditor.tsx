import { TbLink, TbTrash, TbPlus, TbNotes } from "react-icons/tb";
import { Mark } from "prosemirror-model";
import { setTextSelection } from "prosemirror-utils";
import { EditorView } from "prosemirror-view";
import * as React from "react";
import styled from "styled-components";
import isUrl from "../core/queries/isUrl";
import Flex from "./Flex";
import { baseDictionary } from "../dictionary";
import Input from "./Input";
import LinkSearchResult from "./LinkSearchResult";
import ToolbarButton from "./ToolbarButton";
import Tooltip from "./Tooltip";

export type SearchResult = {
  title: string;
  subtitle?: string;
  url: string;
};

type Props = {
  mark?: Mark;
  from: number;
  to: number;
  dictionary: typeof baseDictionary;
  onRemoveLink?: () => void;
  onCreateLink?: (title: string) => Promise<void>;
  onSearchLink?: (term: string) => Promise<SearchResult[]>;
  isRemoteSearch?: boolean;
  onSearchRemote?: (term: string) => Promise<SearchResult[]>;
  isHashTagSearch?: boolean;
  onSearchHashTag?: (term: string) => Promise<SearchResult[]>;
  onSelectLink: (options: {
    href: string;
    title?: string;
    from: number;
    to: number;
  }) => void;
  onOpenLink?: (href: string) => void;
  showPreview?: boolean;
  onShowPreview?: (anchor: string) => string;
  onShowToast?: (message: string, code: string) => void;
  view: EditorView;
};

type State = {
  results: {
    [keyword: string]: SearchResult[];
  };
  value: string;
  previousValue: string;
  selectedIndex: number;
};

class LinkEditor extends React.Component<Props, State> {
  discardInputValue = false;
  initialValue = this.href;
  initialSelectionLength = this.props.to - this.props.from;

  state: State = {
    selectedIndex: -1,
    value: this.href,
    previousValue: "",
    results: {},
  };

  get href(): string {
    const href =  this.props.mark ? this.props.mark.attrs.href : "";
    return decodeURI(href);
  }

  get suggestedLinkTitle(): string {
    const { state } = this.props.view;
    const { value } = this.state;
    const selectionText = state.doc.cut(
      state.selection.from,
      state.selection.to
    ).textContent;

    return value.trim() || selectionText.trim();
  }

  componentWillUnmount = () => {
    // If we discarded the changes then nothing to do
    if (this.discardInputValue) {
      return;
    }

    // If the link is the same as it was when the editor opened, nothing to do
    if (this.state.value === this.initialValue) {
      return;
    }

    // If the link is totally empty or only spaces then remove the mark
    const href = (this.state.value || "").trim();
    if (!href) {
      return this.handleRemoveLink();
    }

    this.save(href, href);
  };

  save = (href: string, title?: string): void => {
    href = href.trim();

    if (href.length === 0) {
      return;
    }

    this.discardInputValue = true;
    const { from, to } = this.props;

    this.props.onSelectLink({ href, title, from, to });
  };

  handleKeyDown = (event: React.KeyboardEvent): void => {
    if (this.props.isRemoteSearch || this.props.onSearchRemote) {
      return;
    }
    switch (event.key) {
      case "Enter": {
        event.preventDefault();
        const { selectedIndex, value } = this.state;
        const results = this.state.results[value] || [];
        const { onCreateLink } = this.props;

        if (selectedIndex >= 0) {
          const result = results[selectedIndex];
          if (result) {
            this.save(result.url, result.title);
          } else if (
            onCreateLink && 
            selectedIndex === results.length
          ) {
            this.handleCreateLink(this.suggestedLinkTitle);
          }
        } else {
          // saves the raw input as href
          this.save(value, value);
        }

        if (this.initialSelectionLength) {
          this.moveSelectionToEnd();
        }

        return;
      }

      case "Escape": {
        event.preventDefault();

        if (this.initialValue) {
          this.setState({ value: this.initialValue }, this.moveSelectionToEnd);
        } else {
          this.handleRemoveLink();
        }
        return;
      }

      case "ArrowUp": {
        if (event.shiftKey) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const prevIndex = this.state.selectedIndex - 1;

        this.setState({
          selectedIndex: Math.max(-1, prevIndex),
        });
        return;
      }

      case "ArrowDown":
      case "Tab": {
        if (event.shiftKey) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const { selectedIndex, value } = this.state;
        const results = this.state.results[value] || [];
        const total = results.length;
        const nextIndex = selectedIndex + 1;

        this.setState({
          selectedIndex: Math.min(nextIndex, total),
        });
        return;
      }
    }
  };

  handleFocusLink = (selectedIndex: number) => {
    this.setState({ selectedIndex });
  };

  handleChangeToSearch = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const value = event.target.value;

    this.setState({
      value,
      selectedIndex: -1,
    });

    const trimmedValue = value.trim();

    if (trimmedValue && this.props.onSearchLink) {
      try {
        const results = this.props.isRemoteSearch && this.props.onSearchRemote 
          ? await this.props.onSearchRemote(trimmedValue)
          : this.props.isHashTagSearch && this.props.onSearchHashTag 
            ? await this.props.onSearchHashTag(trimmedValue)
            : await this.props.onSearchLink(trimmedValue);
        this.setState((state) => ({
          results: {
            ...state.results,
            [trimmedValue]: results,
          },
          previousValue: trimmedValue,
        }));
      } catch (error) {
        console.error(error);
      }
    }
  };

  // handlePaste = (): void => {
  //   setTimeout(() => this.save(this.state.value, this.state.value), 0);
  // };

  handleOpenLink = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const { onOpenLink } = this.props;
    if (onOpenLink) {
      onOpenLink(this.href);
    } else {
      console.log("fail open: ", this.href, onOpenLink);
    }
  };

  handleCreateLink = async (value: string) => {
    this.discardInputValue = true;
    const { onCreateLink } = this.props;

    value = value.trim();
    if (value.length === 0) {
      return;
    }

    if (onCreateLink) {
      return onCreateLink(value);
    }
  };

  handleRemoveLink = (): void => {
    this.discardInputValue = true;

    const { from, to, mark, view, onRemoveLink } = this.props;
    const { state, dispatch } = this.props.view;

    if (mark) {
      dispatch(state.tr.removeMark(from, to, mark));
    }

    if (onRemoveLink) {
      onRemoveLink();
    }

    view.focus();
  };

  handleSelectLink = (url: string, title: string) => (
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    this.save(url, title);

    if (this.initialSelectionLength) {
      this.moveSelectionToEnd();
    }
  };

  moveSelectionToEnd = () => {
    const { to, view } = this.props;
    const { state, dispatch } = view;
    // @ts-ignore
    dispatch(setTextSelection(to)(state.tr));
    view.focus();
  };

  render() {
    const { dictionary } = this.props;
    const { value, selectedIndex } = this.state;
    const results =
      this.state.results[value.trim()] ||
      this.state.results[this.state.previousValue] ||
      [];

    const looksLikeUrl = value.match(/^https?:\/\//i);
    const suggestedLinkTitle = this.suggestedLinkTitle;

    const showCreateLink =
      !!this.props.onCreateLink &&
      !(suggestedLinkTitle === this.initialValue) &&
      suggestedLinkTitle.length > 0 &&
      !looksLikeUrl && 
      !this.props.isRemoteSearch;

    const showResults =
      !!suggestedLinkTitle && (showCreateLink || results.length > 0);
    
    const showPreview = this.props.showPreview;
    const previewContent = this.props.onShowPreview && this.props.onShowPreview(value);

    return (
      <Wrapper>
        <Input
          value={value}
          placeholder={
            showCreateLink
              ? dictionary.findOrCreateDoc
              : dictionary.searchOrPasteLink
          }
          onKeyDown={this.handleKeyDown}
          // onPaste={this.handlePaste}
          onChange={this.handleChangeToSearch}
          autoFocus={this.href === ""}
        />
        <Tooltip tooltip={dictionary.openLink}>
          <ToolbarButton onClick={this.handleOpenLink} disabled={!value}>
            <TbLink color="currentColor" />
          </ToolbarButton>
        </Tooltip>
        <Tooltip tooltip={dictionary.removeLink}>
          <ToolbarButton onClick={this.handleRemoveLink}>
            <TbTrash color="currentColor" />
          </ToolbarButton>
        </Tooltip>

        {(showPreview && previewContent?.trim() && !showResults) && (
          <Preview>{previewContent}</Preview>
        )}

        {showResults && (
          <SearchResults id="link-search-results">
            {results.map((result, index) => (
              <LinkSearchResult
                key={result.url}
                title={result.title}
                subtitle={result.subtitle}
                icon={<TbNotes color="currentColor" />}
                onPointerMove={() => this.handleFocusLink(index)}
                onClick={this.handleSelectLink(result.url, result.title)}
                selected={index === selectedIndex}
              />
            ))}

            {showCreateLink && (
              <LinkSearchResult
                key="create"
                title={suggestedLinkTitle}
                subtitle={dictionary.createNewDoc}
                icon={<TbPlus color="currentColor" />}
                onPointerMove={() => this.handleFocusLink(results.length)}
                onClick={() => {
                  this.handleCreateLink(suggestedLinkTitle);

                  if (this.initialSelectionLength) {
                    this.moveSelectionToEnd();
                  }
                }}
                selected={results.length === selectedIndex}
              />
            )}
          </SearchResults>
        )}
      </Wrapper>
    );
  }
}

const Wrapper = styled(Flex)`
  margin-left: -8px;
  margin-right: -8px;
  min-width: 336px;
  pointer-events: all;
  gap: 8px;
`;

const SearchResults = styled.ol`
  background: ${(props) => props.theme.toolbarBackground};
  position: absolute;
  top: 100%;
  width: 100%;
  height: auto;
  left: 0;
  padding: 0;
  margin: 0;
  margin-top: -3px;
  margin-bottom: 0;
  border-radius: 0 0 4px 4px;
  overflow-y: auto;
  overscroll-behavior: none;
  max-height: 260px;

  @media (hover: none) and (pointer: coarse) {
    position: fixed;
    top: auto;
    bottom: 40px;
    border-radius: 0;
    max-height: 50vh;
    padding: 8px 8px 4px;
  }
`;

const Preview = styled.div`
  font-size: 16px;
  line-height: 1.6em;
  padding: 8px;
`;

export default LinkEditor;
