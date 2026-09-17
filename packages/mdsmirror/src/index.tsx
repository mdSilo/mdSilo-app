/* global window File Promise */
import * as React from "react";
import memoize from "lodash/memoize";
import { EditorState, Selection, Plugin } from "prosemirror-state";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { MarkdownParser } from "prosemirror-markdown";
import { Decoration, EditorView, NodeViewConstructor } from "prosemirror-view";
import { Schema, NodeSpec, MarkSpec, Slice, Node as PmNode } from "prosemirror-model";
import { inputRules, InputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { PluginSimple } from "markdown-it";
import { ThemeProvider } from "styled-components";
import { lightTheme, darkTheme } from "./styles/theme";
import { baseDictionary } from "./dictionary";
import Flex from "./components/Flex";
import { SearchResult } from "./components/LinkEditor";
import { EmbedDescriptor } from "./components/types";
import { ToastType } from "./types";
import SelectionToolbar from "./components/SelectionToolbar";
import { SlashMenu } from "./components/SlashMenu";
import LinkToolbar from "./components/LinkToolbar";
import ComponentView from "./components/ComponentView";
import Extension from "./core/Extension";
import ExtensionManager from "./core/ExtensionManager";
import Node from "./nodes/Node";
import Mark from "./marks/Mark";
import { getHeadings } from "./core/queries/getHeadings";
import { getTasks } from "./core/queries/getTasks";
import { getJSONContent, JSONContent } from "./core/queries/getJSONContent";
import { MarkdownSerializer } from "./core/mdSerializer";
import { Attach } from "./core/commands/attachFiles";

// styles
import { StyledEditor } from "./styles/editor";

// nodes
import Doc from "./nodes/Doc";
import Text from "./nodes/Text";
import Blockquote from "./nodes/Blockquote";
import BulletList from "./nodes/BulletList";
import CodeBlock from "./nodes/CodeBlock";
import CodeFence from "./nodes/CodeFence";
import CheckboxList from "./nodes/CheckboxList";
import CheckboxItem from "./nodes/CheckboxItem";
import HardBreak from "./nodes/HardBreak";
import Heading from "./nodes/Heading";
import HorizontalRule from "./nodes/HorizontalRule";
import ListItem from "./nodes/ListItem";
import OrderedList from "./nodes/OrderedList";
import Paragraph from "./nodes/Paragraph";
import Table from "./nodes/Table";
import TableCell from "./nodes/TableCell";
import TableHeadCell from "./nodes/TableHeadCell";
import TableRow from "./nodes/TableRow";
import MathInline from "./nodes/Math";
import MathDisplay from "./nodes/MathDisplay";
// react nodes
import ReactNode from "./components/reactnodes/ReactNode";
import Attachment from "./components/reactnodes/Attachment";
import Itemcard from "./components/reactnodes/Itemcard";
import Embed from "./components/reactnodes/Embed";
import Image from "./components/reactnodes/Image";
import Notice from "./components/reactnodes/Notice";

// marks
import Bold from "./marks/Bold";
import Code from "./marks/Code";
import Highlight from "./marks/Highlight";
import Italic from "./marks/Italic";
import Sub from "./marks/Sub";
import Sup from "./marks/Sup";
import Link from "./marks/Link";
import WikiLink from "./marks/WikiLink";
import Strikethrough from "./marks/Strikethrough";
import TemplatePlaceholder from "./marks/Placeholder";
import Underline from "./marks/Underline";
import Hashtag from "./marks/Hashtag";

// plugins
import SlashMenuTrigger from "./components/SlashMenuTrigger";
import SearchDocTrigger from "./components/SearchDocTrigger";
import SearchRemoteTrigger from "./components/SearchRemoteTrigger";
import Folding from "./plugins/Folding";
import History from "./plugins/History";
import Keys from "./plugins/Keys";
import MaxLength from "./plugins/MaxLength";
import Placeholder from "./plugins/Placeholder";
import SmartText from "./plugins/SmartText";
import QuickAction from "./plugins/QuickAction";
import TrailingNode from "./plugins/TrailingNode";
import PasteHandler from "./plugins/PasteHandler";

// re-export
export { schema, parser, serializer, renderToHtml } from "./server";
export { default as Extension } from "./core/Extension";
export { embeds } from "./components/embeds/Embeds";
export { SearchResult } from "./components/LinkEditor";
export { Attach } from "./core/commands/attachFiles";
export { JSONContent, getJSONContent } from "./core/queries/getJSONContent";
export { Heading, getHeadings } from "./core/queries/getHeadings";
export { HashTag, getHashtags } from "./core/queries/getHashtags";
export { Task, getTasks } from "./core/queries/getTasks";

export const theme = lightTheme;

export type Props = {
  /** An optional identifier */
  id?: string;
  /** editor content */
  value?: string;
  /** init editor content */
  defaultValue?: string;
  /** Placeholder when the editor is empty */
  placeholder?: string;
  /** Extensions to load */
  extensions?: Extension[];
  /** filter out some extensions */
  disables?: string[]; 
  /** must enable some extensions */
  forced?: string[]; 
  /** if focused on mount? */
  autoFocus?: boolean;
  /** if not allow editing */
  readOnly?: boolean;
  /** if not allow editing except checkbox */
  readOnlyWriteCheckboxes?: boolean;
  /** if show line number in codeblock**/
  showLineNumber?: boolean;
  /** if show preview on click link **/
  showPreview?: boolean;
  /** for translate */
  dictionary?: Partial<typeof baseDictionary>;
  /** The text direction of the content */
  dir?: "rtl" | "ltr";
  /** template options  */
  template?: boolean;
  headingsOffset?: number;
  /** content length limitation */
  maxLength?: number; 
  /** Heading id to scroll */
  scrollTo?: string;
  // theme, style
  /** dark moed? */
  dark?: boolean;
  /** customize theme */
  theme?: Partial<typeof theme>;
  /**additional class */
  className?: string;
  /** customize style */
  style?: React.CSSProperties;
  /** embed types to render in the document */
  embeds?: EmbedDescriptor[];
  embedsDisabled?: boolean;
  // for relative image path
  rootPath?: string;
  protocol?: string; // asset: or https://asset.localhost
  // handle event
  handleDOMEvents?: {
    [name: string]: (view: EditorView, event: Event) => boolean;
  };
  /** Callback on editor blurred */
  onBlur?: () => void;
  /** Callback on editor focused */
  onFocus?: () => void;
  /** Callback on save key combo */
  onSave?: ({ done }: { done: boolean }) => void;
  /** Callback on cancel key combo */
  onCancel?: () => void;
  /** Callback on editor content changed */
  onChange?: (text: string, json: JSONContent) => void;
  /** Callback on create new doc to be linked, return url */
  onCreateLink?: (title: string) => Promise<string>;
  /** Callback on show preview on click link, return the content to preview */
  onShowPreview?: (anchor: string) => string;
  /** Callback on upload file(image...) to serve, return file url */
  uploadFile?: (file: File) => Promise<string>;
  /** Callback on file upload begins */
  onFileUploadStart?: () => void;
  /** Callback on file upload ends */
  onFileUploadStop?: () => void;
  /** Callback on attach local file(image...), return file infos */
  attachFile?: (accept: string) => Promise<Attach[]>;
  // handle event form menu/toolbar...
  /** Calback on search to-be-linked notes per keyword(text) within editor, `[[]]` */
  onSearchLink?: (term: string) => Promise<SearchResult[]>;
  /** Calback on search to-be-linked items per keyword(text) on serve, `{{}}` */
  onSearchRemote?: (term: string) => Promise<SearchResult[]>;
  /** for check remote search **/
  remoteUrlBase?: string;
  /** Calback on search keyword(#hashtag#) within editor */
  onSearchHashTag?: (term: string) => Promise<SearchResult[]>;
  /** Calback on hover on any link */
  onHoverLink?: (event: MouseEvent) => boolean;
  /** Calback on click on hashtag */
  onClickHashtag?: (tag: string, event: MouseEvent) => void;
  /** Calback on search keyword(text) within editor */
  onSearchSelectText?: (txt: string) => void;
  /** Calback on open link */
  onOpenLink?: (href: string) => void;
  /** Callback on click attachment */
  onClickAttachment?: (href: string) => void;
  /** Callback on save diagram svg */
  onSaveDiagram?: (svg: string, ty: string) => void;
  /** Callback on copy heading hash or hashtag hash */
  onCopyHash?: (text: string) => void;
  /** Callback when user presses any key with document focused */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Callback on toast message triggered (eg "importing...") */
  onShowToast?: (message: string, code: ToastType) => void;
};

type State = {
  isRTL: boolean;
  isEditorFocused: boolean;
  selectionMenuOpen: boolean;
  slashMenuOpen: boolean;
  slashOrBlock: boolean; // true: slashmenu, false: side blockmenu
  slashMenuSearch: string;
  linkMenuOpen: boolean;
  searchTriggerOpen: boolean;
  isRemoteSearch: boolean,
  isHashTagSearch: boolean,
};

type Step = {
  slice?: Slice;
};

class MsEditor extends React.PureComponent<Props, State> {
  static defaultProps = {
    defaultValue: "",
    dir: "auto",
    placeholder: "Start Writing…",
    embeds: [],
    extensions: [],
  };

  state = {
    isRTL: false,
    isEditorFocused: false,
    selectionMenuOpen: false,
    slashMenuOpen: false,
    slashMenuSearch: "",
    slashOrBlock: true, // true: slashmenu, false: side blockmenu
    linkMenuOpen: false,
    searchTriggerOpen: false,
    isRemoteSearch: false,
    isHashTagSearch: false,
  };

  isInited = false;
  isBlurred: boolean;
  extensionManager: ExtensionManager;
  // element?: HTMLElement | null;
  elementRef = React.createRef<HTMLDivElement>();
  view: EditorView;
  schema: Schema;
  serializer: MarkdownSerializer;
  parser: MarkdownParser;
  pasteParser: MarkdownParser;
  plugins: Plugin[];
  keymaps: Plugin[];
  inputRules: InputRule[];
  nodeViews: { [name: string]: NodeViewConstructor };
  nodes: { [name: string]: NodeSpec };
  marks: { [name: string]: MarkSpec };
  commands: Record<string, any>;
  rulePlugins: PluginSimple[];

  componentDidMount() {
    this.init();

    if (this.props.scrollTo) {
      this.scrollToAnchor(this.props.scrollTo);
    }

    this.calculateDir();

    if (this.props.readOnly) return;

    if (this.props.autoFocus) {
      this.focusAtEnd();
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Allow changes to the 'value' prop to update the editor from outside
    if (this.props.value && prevProps.value !== this.props.value) {
      const newState = this.createState(this.props.value);
      this.view.updateState(newState);
    }

    // pass readOnly changes through to underlying editor instance
    if (prevProps.readOnly !== this.props.readOnly) {
      this.view.update({
        ...this.view.props,
        editable: () => !this.props.readOnly,
      });
    }

    if (this.props.scrollTo && this.props.scrollTo !== prevProps.scrollTo) {
      this.scrollToAnchor(this.props.scrollTo);
    }

    // Focus at the end of the document if switching from readOnly and autoFocus
    // is set to true
    if (prevProps.readOnly && !this.props.readOnly && this.props.autoFocus) {
      this.focusAtEnd();
    }

    if (prevProps.dir !== this.props.dir) {
      this.calculateDir();
    }

    if (
      !this.isBlurred &&
      !this.state.isEditorFocused &&
      !this.state.slashMenuOpen &&
      !this.state.linkMenuOpen &&
      !this.state.selectionMenuOpen
    ) {
      this.isBlurred = true;
      if (this.props.onBlur) {
        this.props.onBlur();
      }
    }

    if (
      this.isBlurred &&
      (this.state.isEditorFocused ||
        this.state.slashMenuOpen ||
        this.state.linkMenuOpen ||
        this.state.selectionMenuOpen)
    ) {
      this.isBlurred = false;
      if (this.props.onFocus) {
        this.props.onFocus();
      }
    }
  }

  init() {
    console.log(">> start to init", this.isInited);
    this.extensionManager = this.createExtensions();
    this.nodes = this.createNodes();
    this.marks = this.createMarks();
    this.schema = this.createSchema();
    this.plugins = this.createPlugins();
    this.rulePlugins = this.createRulePlugins();
    this.keymaps = this.createKeymaps();
    this.serializer = this.createSerializer();
    this.parser = this.createParser();
    this.pasteParser = this.createPasteParser();
    this.inputRules = this.createInputRules();
    this.nodeViews = this.createNodeViews();
    this.commands = this.createCommands();
    this.view = this.createView()!;
    this.isInited = true;
    console.log(">> end of init", this.isInited);
  }

  createExtensions() {
    const dictionary = this.dictionary(this.props.dictionary);
    const extensions: (Extension | Node | Mark)[] = [
      new Doc(),
      new HardBreak(),
      new Paragraph(),
      new Blockquote(),
      new CodeBlock({
        dark: this.props.dark,
        showLineNumber: this.props.showLineNumber,
        onSaveDiagram: this.props.onSaveDiagram,
      }),
      new CodeFence({
        dark: this.props.dark,
        showLineNumber: this.props.showLineNumber,
        onSaveDiagram: this.props.onSaveDiagram,
      }),
      new Text(),
      new CheckboxList(),
      new CheckboxItem(),
      new BulletList(),
      new OrderedList(),
      new ListItem(),
      new Notice({ dictionary }),
      new Heading({
        dictionary,
        onShowToast: this.props.onShowToast,
      }),
      new HorizontalRule(),
      new Attachment({
        onClickAttachment: this.props.onClickAttachment,
      }),
      new Itemcard({ remoteUrlBase: this.props.remoteUrlBase }),
      new Embed({ embeds: this.props.embeds }),
      new Image({
        dictionary,
        attachFile: this.props.attachFile,
        uploadFile: this.props.uploadFile,
        onFileUploadStart: this.props.onFileUploadStart,
        onFileUploadStop: this.props.onFileUploadStop,
        onShowToast: this.props.onShowToast,
      }),
      new TableCell(),
      new TableHeadCell(),
      new TableRow(),
      new Table(),
      new MathInline(),
      new MathDisplay(),
      new Bold(),
      new Code(),
      new Highlight(),
      new Italic(),
      new Sub(),
      new Sup(),
      new TemplatePlaceholder(),
      new Underline(),
      new Link({
        onKeyboardShortcut: this.handleOpenLinkMenu,
        onHoverLink: this.props.onHoverLink,
      }),
      new WikiLink({
        onCreateLink: this.props.onCreateLink,
      }),
      new Hashtag({
        onClickHashtag: this.props.onClickHashtag,
      }),
      new Strikethrough(),
      new History(),
      new Folding(),
      new SmartText(),
      new QuickAction(),
      new TrailingNode(),
      new PasteHandler(),
      new Keys({
        onBlur: this.handleEditorBlur,
        onFocus: this.handleEditorFocus,
        onSave: this.handleSave,
        onSaveAndExit: this.handleSaveAndExit,
        onCancel: this.props.onCancel,
      }),
      new SlashMenuTrigger({
        dictionary,
        onOpen: this.handleOpenSlashMenu,
        onClose: this.handleCloseSlashMenu,
      }),
      new SearchDocTrigger({
        onOpen: () => {
          this.handleOpenLinkMenu();
          this.setState({ searchTriggerOpen: true });
        },
      }),
      new SearchRemoteTrigger({
        onOpen: () => {
          this.handleOpenLinkMenu();
          this.setState({ searchTriggerOpen: true, isRemoteSearch: true });
        },
      }),
      new Placeholder({
        placeholder: this.props.placeholder || '',
      }),
      new MaxLength({
        maxLength: this.props.maxLength,
      }),
    ];

    const enabledExtensions = extensions.filter(extension => {
      // Optionaly disable extensions
      const exts0 = this.props.disables;
      const exts1 = this.props.forced;
      const extName = extension.name;
      return !(exts0 && exts0.includes(extName)) && (!exts1 || exts1.includes(extName));
    });

    return new ExtensionManager(
      [...enabledExtensions,
        ...(this.props.extensions || []),
      ],
      this
    );
  }

  createPlugins() {
    return this.extensionManager.plugins;
  }

  createRulePlugins() {
    return this.extensionManager.rulePlugins;
  }

  createKeymaps() {
    return this.extensionManager.keymaps({
      schema: this.schema,
    });
  }

  createInputRules() {
    return this.extensionManager.inputRules({
      schema: this.schema,
    });
  }

  createNodeViews() {
    return this.extensionManager.extensions
      .filter((extension: ReactNode) => extension.component)
      .reduce((nodeViews, extension: ReactNode) => {
        const nodeView = (
          node: PmNode,
          view: EditorView,
          getPos: () => number,
          decorations: Decoration[]
        ) => {
          return new ComponentView(extension.component, {
            editor: this,
            extension,
            node,
            view,
            getPos,
            decorations,
          });
        };

        return {
          ...nodeViews,
          [extension.name]: nodeView,
        };
      }, {});
  }

  createCommands() {
    return this.extensionManager.commands({
      schema: this.schema,
      view: this.view,
    });
  }

  createNodes() {
    return this.extensionManager.nodes;
  }

  createMarks() {
    return this.extensionManager.marks;
  }

  createSchema() {
    return new Schema({
      nodes: this.nodes,
      marks: this.marks,
    });
  }

  createSerializer() {
    return this.extensionManager.serializer();
  }

  createParser() {
    return this.extensionManager.parser({
      schema: this.schema,
      plugins: this.rulePlugins,
    });
  }

  createPasteParser() {
    return this.extensionManager.parser({
      schema: this.schema,
      rules: { linkify: true },
      plugins: this.rulePlugins,
    });
  }

  createState(value?: string) {
    const doc = this.createDocument(value || this.props.defaultValue || '');

    return EditorState.create({
      schema: this.schema,
      doc,
      plugins: [
        ...this.plugins,
        ...this.keymaps,
        dropCursor({ color: this.theme().cursor }),
        gapCursor(),
        inputRules({
          rules: this.inputRules,
        }),
        keymap(baseKeymap),
      ],
    });
  }

  createDocument(content: string) {
    return this.parser.parse(content);
  }

  createView() {
    console.log(">> start to create view", this.isInited);
    
    if (!this.elementRef.current) {
      throw new Error("createView called before ref available");
    }
    if (this.isInited) {
      console.log("inited");
      return this.view;
    }

    const isEditingCheckbox = tr => {
      return tr.steps.some(
        (step: Step) =>
          step.slice?.content?.firstChild?.type.name ===
          this.schema.nodes.checkbox_item.name
      );
    };

    const self = this; // eslint-disable-line
    const view = new EditorView(this.elementRef.current, {
      state: this.createState(this.props.value),
      editable: () => !this.props.readOnly,
      nodeViews: this.nodeViews,
      handleDOMEvents: this.props.handleDOMEvents,
      dispatchTransaction: function(transaction) {
        // callback is bound to have the view instance as its this binding
        const { state, transactions } = this.state.applyTransaction(
          transaction
        );

        this.updateState(state);

        // If any of the transactions being dispatched resulted in the doc
        // changing then call our own change handler to let the outside world
        // know
        if (
          transactions.some(tr => tr.docChanged) &&
          (!self.props.readOnly ||
            (self.props.readOnlyWriteCheckboxes &&
              transactions.some(isEditingCheckbox)))
        ) {
          self.handleChange();
        }

        self.calculateDir();

        // Because Prosemirror and React are not linked we must tell React that
        // a render is needed whenever the Prosemirror state changes.
        self.forceUpdate();
      },
    });

    // Tell third-party libraries and screen-readers that this is an input
    view.dom.setAttribute("role", "textbox");
    view.dom.setAttribute("aria-label", "Markdown editor");

    return view;
  }

  scrollToAnchor(hash: string) {
    if (!hash) return;

    try {
      const element = document.querySelector(hash);
      if (element) element.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      // querySelector will throw an error if the hash begins with a number
      // or contains a period. This is protected against now by safeSlugify
      // however previous links may be in the wild.
      console.warn(`Attempted to scroll to invalid hash: ${hash}`, err);
    }
  }

  calculateDir = () => {
    if (!this.elementRef.current) return;

    const isRTL =
      this.props.dir === "rtl" ||
      getComputedStyle(this.elementRef.current).direction === "rtl";

    if (this.state.isRTL !== isRTL) {
      this.setState({ isRTL });
    }
  };

  // get plain text: Markdown
  text = (): string => {
    return this.serializer.serialize(this.view.state.doc);
  };

  // get json: JSON
  json = (): JSONContent => {
    return getJSONContent(this.view.state.doc);
  };

  handleChange = () => {
    if (!this.props.onChange) return;
    this.props.onChange(this.text(), this.json());
  };

  handleSave = () => {
    const { onSave } = this.props;
    if (onSave) {
      onSave({ done: false });
    }
  };

  handleSaveAndExit = () => {
    const { onSave } = this.props;
    if (onSave) {
      onSave({ done: true });
    }
  };

  handleEditorBlur = () => {
    this.setState({ isEditorFocused: false });
  };

  handleEditorFocus = () => {
    this.setState({ isEditorFocused: true });
  };

  handleOpenSelectionMenu = () => {
    this.setState({ slashMenuOpen: false, selectionMenuOpen: true });
  };

  handleCloseSelectionMenu = () => {
    this.setState({ selectionMenuOpen: false });
  };

  handleOpenLinkMenu = () => {
    this.setState({ slashMenuOpen: false, linkMenuOpen: true });
  };

  handleCloseLinkMenu = () => {
    this.setState({ linkMenuOpen: false });
  };

  handleOpenSlashMenu = (search: string, ifNewLine = true, isSlash = true) => {
    // insert new line below automatically, to workaround 
    // the RangeError/override bug on attach local img/file and mix block bug. 
    // workaround override bug, need at least 2 more line 
    // for sake of style, insert another line before attach
    // only insert new line on input '/', not on search
    if (!search && ifNewLine) {
      // const transaction0 = this.view.state.tr.split(
      //   this.view.state.selection.from
      // );
      // this.view.dispatch(transaction0);
      const transaction1 = this.view.state.tr.split(
        this.view.state.selection.to
      );
      this.view.dispatch(transaction1);
      this.view.focus();
    }
    this.setState({ slashMenuOpen: true, slashMenuSearch: search, slashOrBlock: isSlash });
  };

  handleCloseSlashMenu = () => {
    if (!this.state.slashMenuOpen) return;
    this.setState({ slashMenuOpen: false });
  };

  // for relative image src
  handleSrc = (src: string) => {
    const { rootPath, protocol } = this.props;
    if (src.startsWith('./') && rootPath && protocol) {
      const newSrc = src.replace('./', `${protocol}${rootPath}/`);
      return newSrc;
    } else {
      return src;
    }
  };

  // 'public' methods
  focusAtStart = () => {
    const selection = Selection.atStart(this.view.state.doc);
    const transaction = this.view.state.tr.setSelection(selection);
    this.view.dispatch(transaction);
    this.view.focus();
  };

  focusAtEnd = () => {
    const selection = Selection.atEnd(this.view.state.doc);
    const transaction = this.view.state.tr.setSelection(selection);
    this.view.dispatch(transaction);
    this.view.focus();
  };

  getHeadings = () => {
    return getHeadings(this.view.state.doc);
  };

  getTasks = () => {
    return getTasks(this.view.state.doc);
  };

  theme = () => {
    const givenTheme: typeof theme = this.props.dark ? darkTheme : lightTheme;
    const customeTheme = this.props.theme || {};
    return {...givenTheme, ...customeTheme};
  };

  dictionary = memoize(
    (providedDictionary?: Partial<typeof baseDictionary>) => {
      return { ...baseDictionary, ...providedDictionary };
    }
  );

  render() {
    const {
      dir,
      readOnly,
      readOnlyWriteCheckboxes,
      style,
      className,
      onKeyDown,
    } = this.props;
    const { isRTL } = this.state;
    const dictionary = this.dictionary(this.props.dictionary);

    return (
      <Flex
        style={style}
        className={className}
        align="flex-start"
        justify="center"
      >
        <ThemeProvider theme={this.theme()}>
          <React.Fragment>
            <StyledEditor
              dir={dir}
              rtl={isRTL ? 1 : 0}
              readOnly={readOnly}
              readOnlyWriteCheckboxes={readOnlyWriteCheckboxes}
              ref={this.elementRef}
            />
            {!readOnly && this.view && (
              <React.Fragment>
                <SelectionToolbar
                  view={this.view}
                  dictionary={dictionary}
                  commands={this.commands}
                  rtl={isRTL}
                  isTemplate={this.props.template === true}
                  onOpen={this.handleOpenSelectionMenu}
                  onClose={this.handleCloseSelectionMenu}
                  onSearchLink={this.props.onSearchLink}
                  onCreateLink={this.props.onCreateLink}
                  onSearchSelectText={this.props.onSearchSelectText}
                  onOpenLink={this.props.onOpenLink}
                  onShowToast={this.props.onShowToast}
                />
                <LinkToolbar
                  view={this.view}
                  dictionary={dictionary}
                  isActive={this.state.linkMenuOpen}
                  onClose={this.handleCloseLinkMenu}
                  onCreateLink={this.props.onCreateLink}
                  onSearchLink={this.props.onSearchLink}
                  onSearchRemote={
                    this.state.isRemoteSearch ? this.props.onSearchRemote : undefined
                  }
                  onSearchHashTag={
                    this.state.isHashTagSearch ? this.props.onSearchHashTag : undefined
                  }
                  onOpenLink={this.props.onOpenLink}
                  showPreview={this.props.showPreview}
                  onShowPreview={this.props.onShowPreview}
                  onShowToast={this.props.onShowToast}
                  searchTriggerOpen={this.state.searchTriggerOpen}
                  resetSearchTrigger={() => this.setState({ 
                    searchTriggerOpen: false, isRemoteSearch: false, isHashTagSearch: false 
                  })}
                  isRemoteSearch={this.state.isRemoteSearch}
                  isHashTagSearch={this.state.isHashTagSearch}
                />
                <SlashMenu
                  view={this.view}
                  commands={this.commands}
                  dictionary={dictionary}
                  rtl={isRTL}
                  isActive={this.state.slashMenuOpen}
                  search={this.state.slashMenuSearch}
                  isSlash={this.state.slashOrBlock}
                  onClose={this.handleCloseSlashMenu}
                  onLinkToolbarOpen={this.handleOpenLinkMenu}
                  onShowToast={this.props.onShowToast}
                  attachFile={this.props.attachFile}
                  handleSrc={this.handleSrc}
                  uploadFile={this.props.uploadFile}
                  onFileUploadStart={this.props.onFileUploadStart}
                  onFileUploadStop={this.props.onFileUploadStop}
                  embeds={this.props.embeds || []}
                />
              </React.Fragment>
            )}
          </React.Fragment>
        </ThemeProvider>
      </Flex>
    );
  }
}

export default MsEditor;
