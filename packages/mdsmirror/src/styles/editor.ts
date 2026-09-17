import styled from "styled-components";

export const StyledEditor = styled("div")<{
  rtl: 0 | 1; // workround of Warning: Received `false` for a non-boolean attribute
  readOnly?: boolean;
  readOnlyWriteCheckboxes?: boolean;
}>`
  color: ${props => props.theme.text};
  background: ${props => props.theme.background};
  font-family: ${props => props.theme.fontFamily};
  font-size: ${props => 1.1 * (props.theme.fontScale ? props.theme.fontScale[0] : 1)}em;
  line-height: ${props => 1.6 * (props.theme.fontScale ? props.theme.fontScale[1] : 1)}em;
  font-weight: ${props => 400 * (props.theme.fontScale ? props.theme.fontScale[2] : 1)};
  width: 100%;

  .ProseMirror {
    position: relative;
    outline: none;
    word-wrap: break-word;
    white-space: pre-wrap;
    white-space: break-spaces;
    -webkit-font-variant-ligatures: none;
    font-variant-ligatures: none;
    font-feature-settings: "liga" 0; /* the above doesn't seem to work in Edge */
  }

  pre {
    white-space: pre-wrap;
  }

  li {
    position: relative;
  }

  .image {
    text-align: center;
    max-width: 100%;
    clear: both;

    img {
      pointer-events: ${props => (props.readOnly ? "initial" : "none")};
      display: inline-block;
      max-width: 100%;
    }

    .ProseMirror-selectednode img {
      pointer-events: initial;
    }
  }

  .image.placeholder {
    position: relative;
    background: ${props => props.theme.background};
    margin-bottom: calc(28px + 1.2em);

    img {
      opacity: 0.5;
    }
  }

  .image-replacement-uploading {
    img {
      opacity: 0.5;
    }
  }

  .image-right-50 {
    float: right;
    width: 50%;
    margin-left: 2em;
    margin-bottom: 1em;
    clear: initial;
  }

  .image-left-50 {
    float: left;
    width: 50%;
    margin-right: 2em;
    margin-bottom: 1em;
    clear: initial;
  }

  .ProseMirror-hideselection *::selection {
    background: transparent;
  }
  .ProseMirror-hideselection *::-moz-selection {
    background: transparent;
  }
  .ProseMirror-hideselection {
    caret-color: transparent;
  }

  .ProseMirror-selectednode {
    outline: 2px solid
      ${props => (props.readOnly ? "transparent" : props.theme.selected)};
  }

  /* Make sure li selections wrap around markers */

  li.ProseMirror-selectednode {
    outline: none;
  }

  li.ProseMirror-selectednode:after {
    content: "";
    position: absolute;
    left: ${props => (props.rtl ? "-2px" : "-32px")};
    right: ${props => (props.rtl ? "-32px" : "-2px")};
    top: -2px;
    bottom: -2px;
    border: 2px solid ${props => props.theme.selected};
    pointer-events: none;
  }

  .caption {
    border: 0;
    display: block;
    font-style: italic;
    font-weight: normal;
    font-size: 13px;
    color: ${props => props.theme.textSecondary};
    padding: 8px 0 4px;
    line-height: 16px;
    text-align: center;
    min-height: 1em;
    outline: none;
    background: none;
    resize: none;
    user-select: text;
    margin: 0 auto !important;
    width: 100%;
    max-width: 100vw;
  }

  .ProseMirror[contenteditable="false"] {
    .caption {
      pointer-events: none;
    }
    .caption:empty {
      visibility: hidden;
    }
  }

  h1 {
    font-size: xx-large;
  }
  h2 {
    font-size: x-large;
  }
  h3 {
    font-size: large;
  }
  h4 {
    font-size: medium;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 1em 0 0.5em;
    font-weight: ${props => 500 * (props.theme.fontScale ? props.theme.fontScale[2] : 1)};
    cursor: text;

    &:not(.placeholder):before {
      display: ${props => (props.readOnly ? "none" : "inline-block")};
      font-family: ${props => props.theme.fontFamilyMono};
      color: ${props => props.theme.textSecondary};
      font-size: 13px;
      line-height: 0;
      margin-${props => (props.rtl ? "right" : "left")}: -24px;
      transition: opacity 150ms ease-in-out;
      opacity: 0;
      width: 24px;
    }

    &:hover,
    &:focus-within {
      .heading-actions {
        opacity: 1;
      }
    }
  }

  .heading-content {
    &:before {
      content: "";
      display: inline;
    }
  }

  .hashtag-name,
  .heading-name {
    color: ${props => props.theme.text};

    &:hover {
      text-decoration: none;
    }
  }

  a:first-child {
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin-top: 0;
    }
  }

  h1:not(.placeholder):before {
    content: "H1";
  }
  h2:not(.placeholder):before {
    content: "H2";
  }
  h3:not(.placeholder):before {
    content: "H3";
  }
  h4:not(.placeholder):before {
    content: "H4";
  }
  h5:not(.placeholder):before {
    content: "H5";
  }
  h6:not(.placeholder):before {
    content: "H6";
  }

  .ProseMirror-focused {
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      &:not(.placeholder):before {
        opacity: 1;
      }
    }
  }

  .heading-anchor,
  .heading-fold {
    display: inline-block;
    color: ${props => props.theme.text};
    opacity: .75;
    cursor: pointer;
    background: none;
    outline: none;
    border: 0;
    margin: 0;
    padding: 0;
    text-align: left;
    font-family: ${props => props.theme.fontFamilyMono};
    font-size: 14px;
    line-height: 0;
    width: 12px;
    height: 24px;

    &:focus,
    &:hover {
      opacity: 1;
    }
  }

  .heading-actions {
    opacity: 0;
    background: ${props => props.theme.background};
    margin-${props => (props.rtl ? "right" : "left")}: -26px;
    flex-direction: ${props => (props.rtl ? "row-reverse" : "row")};
    display: inline-flex;
    position: relative;
    top: -2px;
    width: 26px;
    height: 24px;

    &.collapsed {
      opacity: 1;
    }

    &.collapsed .heading-anchor {
      opacity: 0;
    }

    &.collapsed .heading-fold {
      opacity: 1;
    }
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    &:hover {
      .heading-anchor {
        opacity: 0.75 !important;
      }
      .heading-anchor:hover {
        opacity: 1 !important;
      }
    }
  }

  .heading-fold {
    display: inline-block;
    transform-origin: center;
    padding: 0;

    &.collapsed {
      transform: rotate(${props => (props.rtl ? "90deg" : "-90deg")});
      transition-delay: 0.1s;
      opacity: 1;
    }
  }

  .hashtag-node {
    color: #08c;
  }

  .placeholder:before {
    display: block;
    opacity: 0;
    transition: opacity 150ms ease-in-out;
    content: ${props => (props.readOnly ? "" : "attr(data-empty-text)")};
    pointer-events: none;
    height: 0;
    color: ${props => props.theme.placeholder};
  }

  /** Show the placeholder if focused or the first visible item nth(2) accounts for block insert trigger */
  .ProseMirror-focused .placeholder:before,
  .placeholder:nth-child(1):before,
  .placeholder:nth-child(2):before {
    opacity: 1;
  }

  .notice-block {
    display: flex;
    align-items: center;    
    border-radius: 4px;
    padding: 8px 16px;
    margin: 8px 0;
    background: ${props => props.theme.noticeInfoBackground};
    color: ${props => props.theme.noticeInfoText};

    a {
      color: ${props => props.theme.noticeInfoText};
    }

    a:not(.heading-name), a:not(.hashtag-name) {
      text-decoration: underline;
    }
  }

  .notice-block .content {
    flex-grow: 1;
    min-width: 0;
  }

  .notice-block .icon {
    width: 24px;
    height: 24px;
    align-self: flex-start;
    margin-${props => (props.rtl ? "left" : "right")}: 4px;
    position: relative;
    top: 1px;
  }

  .notice-block .icon svg {
    margin: 1em 0;
  }

  .notice-block.tip {
    background: ${props => props.theme.noticeTipBackground};
    color: ${props => props.theme.noticeTipText};

    a {
      color: ${props => props.theme.noticeTipText};
    }
  }

  .notice-block.warning {
    background: ${props => props.theme.noticeWarningBackground};
    color: ${props => props.theme.noticeWarningText};

    a {
      color: ${props => props.theme.noticeWarningText};
    }
  }

  blockquote {
    border-left: 3px solid ${props => props.theme.quote};
    margin: 5px;
    padding-left: 5px;
    font-style: italic;
  }

  b,
  strong {
    font-weight: ${props => 600 * (props.theme.fontScale ? props.theme.fontScale[2] : 1)};
  }

  .template-placeholder {
    color: ${props => props.theme.placeholder};
    border-bottom: 1px dotted ${props => props.theme.placeholder};
    border-radius: 2px;
    cursor: text;

    &:hover {
      border-bottom: 1px dotted
        ${props =>
          props.readOnly ? props.theme.placeholder : props.theme.textSecondary};
    }
  }

  p {
    margin: 1em 0;

    span:first-child + br:last-child {
      display: none;
    }
  }

  a {
    color: ${props => props.theme.link};
    cursor: pointer;
    text-decoration: none
  }
  a:hover {
    text-decoration: underline;
  }

  .hashtag-link {
    color: ${props => props.theme.hashtag};
    cursor: pointer;
  }
  .hashtag-link:before {
    content: "#";
    display: inline;
  }

  .link-anchor {
    font-size: 12px;
    padding: 0 2px;
  }

  ol {
    list-style-type: decimal !important;
  }
  
  ul {
    list-style-type: disc !important;
  }

  ul,
  ol {
    margin: ${props => (props.rtl ? "0 -26px 0 0.1em" : "0 0.1em 0 -26px")};
    padding: ${props => (props.rtl ? "0 44px 0 0" : "0 0 0 44px")};
  }

  ol ol {
    list-style: lower-alpha;
  }

  ol ol ol {
    list-style: lower-roman;
  }

  ul.checkbox_list {
    padding: 0;
    margin: ${props => (props.rtl ? "0 -24px 0 0" : "0 0 0 -24px")};
  }

  ul li,
  ol li {
    position: relative;
    white-space: initial;

    p {
      white-space: pre-wrap;
    }

    > div {
      width: 100%;
    }
  }

  ul.checkbox_list > li {
    display: flex;
    list-style: none;
    padding-${props => (props.rtl ? "right" : "left")}: 24px;
  }

  ul.checkbox_list > li.checked > div > p {
    color: ${props => props.theme.textSecondary};
    text-decoration: underline;
  }

  ul li[draggable=true]::before,
  ol li[draggable=true]::before {
    cursor: grabbing;
  }

  ul > li.counter-2::before,
  ol li.counter-2::before {
    ${props => (props.rtl ? "right" : "left")}: -50px;
  }

  ul > li.hovering::before,
  ol li.hovering::before {
    opacity: 0.5;
  }

  ul li.ProseMirror-selectednode::after,
  ol li.ProseMirror-selectednode::after {
    display: none;
  }

  ul.checkbox_list > li::before {
    ${props => (props.rtl ? "right" : "left")}: 0;
  }

  ul.checkbox_list li input {
    cursor: pointer;
    pointer-events: ${props =>
      props.readOnly && !props.readOnlyWriteCheckboxes ? "none" : "initial"};
    opacity: ${props =>
      props.readOnly && !props.readOnlyWriteCheckboxes ? 0.75 : 1};
    margin: 0 0.5em 0 0.5em;
    width: 14px;
    height: 14px;
  }

  li p:first-child {
    margin: 0;
    word-break: break-word;
  }

  hr {
    position: relative;
    height: 1em;
    border: 0;
  }

  hr:before {
    content: "";
    display: block;
    position: absolute;
    border-top: 1px solid ${props => props.theme.horizontalRule};
    top: 0.5em;
    left: 0;
    right: 0;
  }

  hr.page-break {
    page-break-after: always;
  }

  hr.page-break:before {
    border-top: 1px dashed ${props => props.theme.horizontalRule};
  }

  code {
    border-radius: 4px;
    border: 1px solid ${props => props.theme.codeBorder};
    background: ${props => props.theme.codeBackground};
    padding: 3px 4px;
    font-family: ${props => props.theme.fontFamilyMono};
    font-size: 80%;
  }

  mark {
    border-radius: 1px;
    color: ${props => props.theme.textHighlightForeground};
    background: ${props => props.theme.textHighlight};

    a {
      color: ${props => props.theme.textHighlightForeground};
    }
  }

  .code-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    position: absolute;
    z-index: 1;
    top: 8px;
    right: 8px;
  }

  .code-block,
  .notice-block {
    position: relative;

    select,
    button {
      background: ${props => props.theme.blockToolbarBackground};
      color: ${props => props.theme.blockToolbarItem};
      border-width: 1px;
      font-size: 13px;
      display: none;
      position: absolute;
      border-radius: 4px;
      padding: 2px;
      z-index: 1;
      top: 4px;
    }

    &.code-block {
      select,
      button {
        right: 4px;
      }
    }

    &.notice-block {
      select,
      button {
        ${props => (props.rtl ? "left" : "right")}: 4px;
      }
    }

    button {
      padding: 2px 4px;
    }

    &:hover {
      select {
        display: ${props => (props.readOnly ? "none" : "inline")};
      }

      button {
        display: ${props => (props.readOnly ? "inline" : "none")};
      }
    }

    select:focus,
    select:active {
      display: inline;
    }

    button.show-source-button {
      display: none;
    }
    button.show-diagram-button {
      margin-top: 20px;
      display: inline;
    }
  
    &.code-hidden { 
      button,
      select,
      button.show-diagram-button {
        display: none;
      }
  
      button.show-source-button {
        display: inline;
      }
  
      pre {
        display: none;
      }
    }
  }

  .code-block.with-line-numbers {
    pre {
      padding-left: calc(var(--line-number-gutter-width, 0) * 1em + 1.5em);
    }
  
    &:after {
      content: attr(data-line-numbers);
      position: absolute;
      padding-left: 1em;
      left: 1px;
      top: calc(1px + 0.75em);
      width: calc(var(--line-number-gutter-width,0) * 1em + .25em);
      word-break: break-all;
      white-space: break-spaces;
      font-family: ${props => props.theme.fontFamilyMono};
      font-size: 13px;
      line-height: 1.4em;
      color: ${props => props.theme.textTertiary};
      background: ${props => props.theme.codeBackground};
      text-align: right;
      font-variant-numeric: tabular-nums;
      user-select: none;
    }
  }

  .abcjs-diagram-wrapper,
  .mermaid-diagram-wrapper,
  .echarts-diagram-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${props => props.theme.codeBackground};
    border-radius: 6px;
    border: 1px solid ${props => props.theme.codeBorder};
    padding: 8px;
    user-select: none;
    cursor: default;
  
    * {
      font-family: ${props => props.theme.fontFamily};
    }
  
    &.diagram-hidden {
      display: none;
    }
  }

  .abcjs-audio-wrapper {
    height: 35px;
    margin: 2px 2px 2px 2px;
  }

  pre {
    display: block;
    overflow-x: auto;
    padding: 0.75em 1em;
    line-height: 1.4em;
    position: relative;
    background: ${props => props.theme.codeBackground};
    border-radius: 4px;
    border: 1px solid ${props => props.theme.codeBorder};

    -webkit-font-smoothing: initial;
    font-family: ${props => props.theme.fontFamilyMono};
    font-size: 13px;
    direction: ltr;
    text-align: left;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    -moz-tab-size: 4;
    -o-tab-size: 4;
    tab-size: 4;
    -webkit-hyphens: none;
    -moz-hyphens: none;
    -ms-hyphens: none;
    hyphens: none;
    color: ${props => props.theme.code};
    margin: 0;

    code {
      font-size: 13px;
      background: none;
      padding: 0;
      border: 0;
    }
  }

  .token.comment,
  .token.prolog,
  .token.doctype,
  .token.cdata {
    color: ${props => props.theme.codeComment};
  }

  .token.punctuation {
    color: ${props => props.theme.codePunctuation};
  }

  .token.namespace {
    opacity: 0.7;
  }

  .token.operator,
  .token.boolean,
  .token.number {
    color: ${props => props.theme.codeNumber};
  }

  .token.property {
    color: ${props => props.theme.codeProperty};
  }

  .token.tag {
    color: ${props => props.theme.codeTag};
  }

  .token.string {
    color: ${props => props.theme.codeString};
  }

  .token.selector {
    color: ${props => props.theme.codeSelector};
  }

  .token.attr-name {
    color: ${props => props.theme.codeAttr};
  }

  .token.entity,
  .token.url,
  .language-css .token.string,
  .style .token.string {
    color: ${props => props.theme.codeEntity};
  }

  .token.attr-value,
  .token.keyword,
  .token.control,
  .token.directive,
  .token.unit {
    color: ${props => props.theme.codeKeyword};
  }

  .token.function {
    color: ${props => props.theme.codeFunction};
  }

  .token.statement,
  .token.regex,
  .token.atrule {
    color: ${props => props.theme.codeStatement};
  }

  .token.placeholder,
  .token.variable {
    color: ${props => props.theme.codePlaceholder};
  }

  .token.deleted {
    text-decoration: line-through;
  }

  .token.inserted {
    border-bottom: 1px dotted ${props => props.theme.codeInserted};
    text-decoration: none;
  }

  .token.italic {
    font-style: italic;
  }

  .token.important,
  .token.bold {
    font-weight: bold;
  }

  .token.important {
    color: ${props => props.theme.codeImportant};
  }

  .token.entity {
    cursor: help;
  }

  .table-full-width {
    transform: translateX(calc(50% + 32px + var(--container-width) * -0.5 + var(--full-width-transform-offset)));

    .table-scrollable,
    table {
      width: calc(var(--container-width) - ${32 * 2}px);
    }

    &.table-shadow-right::after {
      left: calc(var(--container-width) - ${32 * 3}px);
    }
  }

  table {
    width: 100%;
    border-collapse: collapse;
    border-radius: 4px;
    margin-top: 1em;
    box-sizing: border-box;

    * {
      box-sizing: border-box;
    }

    tr {
      position: relative;
      border-bottom: 1px solid ${props => props.theme.divider};
    }

    td,
    th {
      position: relative;
      vertical-align: top;
      border: 1px solid ${props => props.theme.divider};
      position: relative;
      padding: 4px 8px;
      text-align: start;
      min-width: 100px;
      font-weight: normal;
    }

    th {
      background: ${props => props.theme.background};
      color: ${props => props.theme.textSecondary};
      font-weight: 500;
    }

    td .component-embed {
      padding: 4px 0;
    }

    .selectedCell {
      background: ${
        props => props.readOnly ? "inherit" : props.theme.tableSelectedBackground
      };

      /* fixes Firefox background color painting over border:
      * https://bugzilla.mozilla.org/show_bug.cgi?id=688556 */
      background-clip: padding-box;
    }

    .table-add-row,
    .table-add-column,
    .table-grip,
    .table-grip-column,
    .table-grip-row {
      @media print {
        display: none;
      }
    }

    .table-add-row,
    .table-add-column {
      display: block;
      position: absolute;
      background: ${props => props.theme.accent};
      cursor: var(--pointer);

      &:hover::after {
        width: 16px;
        height: 16px;
        z-index: 20;
        background-color: ${props => props.theme.accent};
        background-size: 16px 16px;
        background-position: 50% 50%;
        background-image: url("data:image/svg+xml;base64,${btoa(
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 5C11.4477 5 11 5.44772 11 6V11H6C5.44772 11 5 11.4477 5 12C5 12.5523 5.44772 13 6 13H11V18C11 18.5523 11.4477 19 12 19C12.5523 19 13 18.5523 13 18V13H18C18.5523 13 19 12.5523 19 12C19 11.4477 18.5523 11 18 11H13V6C13 5.44772 12.5523 5 12 5Z" fill="white"/></svg>'
        )}")
      }

      // extra clickable area
      &::before {
        content: "";
        display: block;
        cursor: var(--pointer);
        position: absolute;
        width: 24px;
        height: 24px;
      }
    }

    .table-add-row {
      bottom: -1px;
      left: -16px;
      width: 0;
      height: 2px;

      &::after {
        content: "";
        position: absolute;
        bottom: -1px;
        left: -10px;
        width: 4px;
        height: 4px;
        display: ${props => props.readOnly ? "none" : "block"};
        border-radius: 100%;
        background-color: ${props => props.theme.divider};
      }

      &:hover {
        width: calc(var(--table-width) - ${32 * 1.5}px);
      }

      &:hover::after {
        bottom: -7.5px;
        left: -16px;
      }

      // extra clickable area
      &::before {
        bottom: -12px;
        left: -18px;
      }

      &.first {
        bottom: auto;
        top: -1px;

        &::before {
          bottom: auto;
          top: -12px;
        }
      }
    }

    .table-add-column {
      top: -16px;
      right: -1px;
      width: 2px;
      height: 0;

      &::after {
        content: "";
        position: absolute;
        top: -10px;
        right: -1px;
        width: 4px;
        height: 4px;
        display: ${props => props.readOnly ? "none" : "block"};
        border-radius: 100%;
        background-color: ${props => props.theme.divider};
      }

      &:hover {
        height: calc(var(--table-height) - 32px + 6px);
      }

      &:hover::after {
        top: -16px;
        right: -7px;
      }

      // extra clickable area
      &::before {
        top: -16px;
        right: -12px;
      }

      &.first {
        right: auto;
        left: -1px;

        &::before {
          right: auto;
          left: -12px;
        }
      }
    }

    .table-grip-column {
      /* usage of ::after for all of the table grips works around a bug in
      * prosemirror-tables that causes Safari to hang when selecting a cell
      * in an empty table:
      * https://github.com/ProseMirror/prosemirror/issues/947 */
      &::after {
        content: "";
        cursor: var(--pointer);
        position: absolute;
        top: -16px;
        left: 0;
        width: 100%;
        height: 12px;
        background: ${props => props.theme.divider};
        display: ${props => props.readOnly ? "none" : "block"};
      }

      &:hover::after {
        background: ${props => props.theme.text};
      }
      &.first::after {
        border-top-left-radius: 3px;
        border-bottom-left-radius: 3px;
      }
      &.last::after {
        border-top-right-radius: 3px;
        border-bottom-right-radius: 3px;
      }
      &.selected::after {
        background: ${props => props.theme.tableSelected};
      }
    }

    .table-grip-row {
      &::after {
        content: "";
        cursor: var(--pointer);
        position: absolute;
        left: -16px;
        top: 0;
        height: 100%;
        width: 12px;
        background: ${props => props.theme.divider};
        border-color: ${props => props.theme.background};
        display: ${props => props.readOnly ? "none" : "block"};
      }

      &:hover::after {
        background: ${props => props.theme.text};
      }
      &.first::after {
        border-top-left-radius: 3px;
        border-top-right-radius: 3px;
      }
      &.last::after {
        border-bottom-left-radius: 3px;
        border-bottom-right-radius: 3px;
      }
      &.selected::after {
        background: ${props => props.theme.tableSelected};
      }
    }

    .table-grip {
      &::after {
        content: "";
        cursor: var(--pointer);
        background: ${props => props.theme.divider};
        width: 13px;
        height: 13px;
        border-radius: 13px;
        border: 2px solid ${props => props.theme.background};
        position: absolute;
        top: -18px;
        left: -18px;
        display: ${props => props.readOnly ? "none" : "block"};
        z-index: 10;
      }

      &:hover::after {
        background: ${props => props.theme.text};
      }
      &.selected::after {
        background: ${props => props.theme.tableSelected};
      }
    }
  }

  .table-wrapper {
    position: relative;
  }

  .table-scrollable {
    position: relative;
    margin: -1em -32px -0.5em;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    overflow-y: hidden;
    overflow-x: auto;
    padding-top: 1em;
    padding-bottom: .5em;
    padding-left: 32px;
    padding-right: 32px;
    transition: border 250ms ease-in-out 0s;

    &:hover {
      scrollbar-color: ${props => props.theme.scrollbarThumb} ${
        props => props.theme.scrollbarBackground
      };
    }

    & ::-webkit-scrollbar {
      height: 14px;
      background-color: transparent;
    }

    &:hover ::-webkit-scrollbar {
      background-color: ${props => props.theme.scrollbarBackground};
    }

    & ::-webkit-scrollbar-thumb {
      background-color: transparent;
      border: 3px solid transparent;
      border-radius: 7px;
    }

    &:hover ::-webkit-scrollbar-thumb {
      background-color: ${props => props.theme.scrollbarThumb};
      border-color: ${props => props.theme.scrollbarBackground};
    }
  }

  .table-shadow-left::before,
  .table-shadow-right::after {
    content: "";
    position: absolute;
    top: 1px;
    bottom: 0;
    left: -1em;
    width: 32px;
    z-index: 20;
    transition: box-shadow 250ms ease-in-out;
    border: 0px solid transparent;
    pointer-events: none;
  }

  .table-shadow-left::before {
    left: -32px;
    right: auto;
    box-shadow: 16px 0 16px -16px inset rgba(0, 0, 0, ${
      props => props.theme.isDark ? 1 : 0.25
    });
    border-left: 32px solid ${props => props.theme.background};
  }

  .table-shadow-right::after {
    right: -32px;
    left: auto;
    box-shadow: -16px 0 16px -16px inset rgba(0, 0, 0, ${
      props => props.theme.isDark ? 1 : 0.25
    });
    border-right: 32px solid ${props => props.theme.background};
  }

  .scrollable-wrapper {
    position: relative;
    margin: 0.5em 0px;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;

    &:hover {
      scrollbar-color: ${props => props.theme.scrollbarThumb} ${props =>
  props.theme.scrollbarBackground};
    }

    & ::-webkit-scrollbar {
      height: 14px;
      background-color: transparent;
    }

    &:hover ::-webkit-scrollbar {
      background-color: ${props => props.theme.scrollbarBackground};
    }

    & ::-webkit-scrollbar-thumb {
      background-color: transparent;
      border: 3px solid transparent;
      border-radius: 7px;
    }

    &:hover ::-webkit-scrollbar-thumb {
      background-color: ${props => props.theme.scrollbarThumb};
      border-color: ${props => props.theme.scrollbarBackground};
    }
  }

  .scrollable {
    overflow-y: hidden;
    overflow-x: auto;
    padding-${props => (props.rtl ? "right" : "left")}: 1em;
    margin-${props => (props.rtl ? "right" : "left")}: -1em;
    border-${props => (props.rtl ? "right" : "left")}: 1px solid transparent;
    border-${props => (props.rtl ? "left" : "right")}: 1px solid transparent;
    transition: border 250ms ease-in-out 0s;
  }

  .scrollable-shadow {
    position: absolute;
    top: 0;
    bottom: 0;
    ${props => (props.rtl ? "right" : "left")}: -1em;
    width: 16px;
    transition: box-shadow 250ms ease-in-out;
    border: 0px solid transparent;
    border-${props => (props.rtl ? "right" : "left")}-width: 1em;
    pointer-events: none;

    &.left {
      box-shadow: 16px 0 16px -16px inset rgba(0, 0, 0, ${
        props => props.theme.isDark ? 1 : 0.25
      });
      border-left: 1em solid ${props => props.theme.background};
    }

    &.right {
      right: 0;
      left: auto;
      box-shadow: -16px 0 16px -16px inset rgba(0, 0, 0, ${
        props => props.theme.isDark ? 1 : 0.25
      });
    }
  }

  .slash-menu-trigger {
    display: ${props => (props.readOnly ? "none" : "inline")};
    color: ${props => props.theme.textSecondary};
    font-size: 24px;
    background: none;
    position: absolute;
    transition: color 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275),
      transform 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275),
      opacity 150ms ease-in-out;
    outline: none;
    border: 0;
    padding: 0;
    margin-top: 1px;
    margin-${props => (props.rtl ? "right" : "left")}: -24px;

    &:hover,
    &:focus {
      cursor: pointer;
      transform: scale(1.2);
      color: ${props => props.theme.text};
    }
  }

  .ProseMirror-focused .slash-menu-trigger,
  .slash-menu-trigger:active,
  .slash-menu-trigger:focus {
    opacity: 1;
    pointer-events: initial;
  }

  .ProseMirror-gapcursor {
    display: none;
    pointer-events: none;
    position: absolute;
  }

  .ProseMirror-gapcursor:after {
    content: "";
    display: block;
    position: absolute;
    top: -2px;
    width: 20px;
    border-top: 1px solid ${props => props.theme.cursor};
    animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
  }

  .folded-content {
    display: none;
  }

  @keyframes ProseMirror-cursor-blink {
    to {
      visibility: hidden;
    }
  }

  .ProseMirror-focused .ProseMirror-gapcursor {
    display: block;
  }

  .katex {
    font: normal 1.21em KaTeX_Main, Times New Roman, serif;
    line-height: 1.2;
    text-indent: 0;
    text-rendering: auto;
  }
  .katex * {
    -ms-high-contrast-adjust: none !important;
    border-color: currentColor;
  }
  .katex .katex-version::after {
    content: "0.15.3";
  }
  .katex .katex-mathml {
    /* Accessibility hack to only show to screen readers
          Found at: http://a11yproject.com/posts/how-to-hide-content/ */
    position: absolute;
    clip: rect(1px, 1px, 1px, 1px);
    padding: 0;
    border: 0;
    height: 1px;
    width: 1px;
    overflow: hidden;
  }
  .katex .katex-html {
    /* newline is an empty block at top level, between .base elements */
  }
  .katex .katex-html > .newline {
    display: block;
  }
  .katex .base {
    position: relative;
    display: inline-block;
    white-space: nowrap;
    width: -webkit-min-content;
    width: -moz-min-content;
    width: min-content;
  }
  .katex .strut {
    display: inline-block;
  }
  .katex .textbf {
    font-weight: bold;
  }
  .katex .textit {
    font-style: italic;
  }
  .katex .textrm {
    font-family: KaTeX_Main;
  }
  .katex .textsf {
    font-family: KaTeX_SansSerif;
  }
  .katex .texttt {
    font-family: KaTeX_Typewriter;
  }
  .katex .mathnormal {
    font-family: KaTeX_Math;
    font-style: italic;
  }
  .katex .mathit {
    font-family: KaTeX_Main;
    font-style: italic;
  }
  .katex .mathrm {
    font-style: normal;
  }
  .katex .mathbf {
    font-family: KaTeX_Main;
    font-weight: bold;
  }
  .katex .boldsymbol {
    font-family: KaTeX_Math;
    font-weight: bold;
    font-style: italic;
  }
  .katex .amsrm {
    font-family: KaTeX_AMS;
  }
  .katex .mathbb,
  .katex .textbb {
    font-family: KaTeX_AMS;
  }
  .katex .mathcal {
    font-family: KaTeX_Caligraphic;
  }
  .katex .mathfrak,
  .katex .textfrak {
    font-family: KaTeX_Fraktur;
  }
  .katex .mathtt {
    font-family: KaTeX_Typewriter;
  }
  .katex .mathscr,
  .katex .textscr {
    font-family: KaTeX_Script;
  }
  .katex .mathsf,
  .katex .textsf {
    font-family: KaTeX_SansSerif;
  }
  .katex .mathboldsf,
  .katex .textboldsf {
    font-family: KaTeX_SansSerif;
    font-weight: bold;
  }
  .katex .mathitsf,
  .katex .textitsf {
    font-family: KaTeX_SansSerif;
    font-style: italic;
  }
  .katex .mainrm {
    font-family: KaTeX_Main;
    font-style: normal;
  }
  .katex .vlist-t {
    display: inline-table;
    table-layout: fixed;
    border-collapse: collapse;
  }
  .katex .vlist-r {
    display: table-row;
  }
  .katex .vlist {
    display: table-cell;
    vertical-align: bottom;
    position: relative;
  }
  .katex .vlist > span {
    display: block;
    height: 0;
    position: relative;
  }
  .katex .vlist > span > span {
    display: inline-block;
  }
  .katex .vlist > span > .pstrut {
    overflow: hidden;
    width: 0;
  }
  .katex .vlist-t2 {
    margin-right: -2px;
  }
  .katex .vlist-s {
    display: table-cell;
    vertical-align: bottom;
    font-size: 1px;
    width: 2px;
    min-width: 2px;
  }
  .katex .vbox {
    display: inline-flex;
    flex-direction: column;
    align-items: baseline;
  }
  .katex .hbox {
    display: inline-flex;
    flex-direction: row;
    width: 100%;
  }
  .katex .thinbox {
    display: inline-flex;
    flex-direction: row;
    width: 0;
    max-width: 0;
  }
  .katex .msupsub {
    text-align: left;
  }
  .katex .mfrac > span > span {
    text-align: center;
  }
  .katex .mfrac .frac-line {
    display: inline-block;
    width: 100%;
    border-bottom-style: solid;
  }
  .katex .mfrac .frac-line,
  .katex .overline .overline-line,
  .katex .underline .underline-line,
  .katex .hline,
  .katex .hdashline,
  .katex .rule {
    min-height: 1px;
  }
  .katex .mspace {
    display: inline-block;
  }
  .katex .llap,
  .katex .rlap,
  .katex .clap {
    width: 0;
    position: relative;
  }
  .katex .llap > .inner,
  .katex .rlap > .inner,
  .katex .clap > .inner {
    position: absolute;
  }
  .katex .llap > .fix,
  .katex .rlap > .fix,
  .katex .clap > .fix {
    display: inline-block;
  }
  .katex .llap > .inner {
    right: 0;
  }
  .katex .rlap > .inner,
  .katex .clap > .inner {
    left: 0;
  }
  .katex .clap > .inner > span {
    margin-left: -50%;
    margin-right: 50%;
  }
  .katex .rule {
    display: inline-block;
    border: solid 0;
    position: relative;
  }
  .katex .overline .overline-line,
  .katex .underline .underline-line,
  .katex .hline {
    display: inline-block;
    width: 100%;
    border-bottom-style: solid;
  }
  .katex .hdashline {
    display: inline-block;
    width: 100%;
    border-bottom-style: dashed;
  }
  .katex .sqrt > .root {
    /* These values are taken from the definition of \r@@t,\mkern 5mu and \mkern -10mu. */
    margin-left: 0.27777778em;
    margin-right: -0.55555556em;
  }
  .katex .sizing.reset-size1.size1,
  .katex .fontsize-ensurer.reset-size1.size1 {
    font-size: 1em;
  }
  .katex .sizing.reset-size1.size2,
  .katex .fontsize-ensurer.reset-size1.size2 {
    font-size: 1.2em;
  }
  .katex .sizing.reset-size1.size3,
  .katex .fontsize-ensurer.reset-size1.size3 {
    font-size: 1.4em;
  }
  .katex .sizing.reset-size1.size4,
  .katex .fontsize-ensurer.reset-size1.size4 {
    font-size: 1.6em;
  }
  .katex .sizing.reset-size1.size5,
  .katex .fontsize-ensurer.reset-size1.size5 {
    font-size: 1.8em;
  }
  .katex .sizing.reset-size1.size6,
  .katex .fontsize-ensurer.reset-size1.size6 {
    font-size: 2em;
  }
  .katex .sizing.reset-size1.size7,
  .katex .fontsize-ensurer.reset-size1.size7 {
    font-size: 2.4em;
  }
  .katex .sizing.reset-size1.size8,
  .katex .fontsize-ensurer.reset-size1.size8 {
    font-size: 2.88em;
  }
  .katex .sizing.reset-size1.size9,
  .katex .fontsize-ensurer.reset-size1.size9 {
    font-size: 3.456em;
  }
  .katex .sizing.reset-size1.size10,
  .katex .fontsize-ensurer.reset-size1.size10 {
    font-size: 4.148em;
  }
  .katex .sizing.reset-size1.size11,
  .katex .fontsize-ensurer.reset-size1.size11 {
    font-size: 4.976em;
  }
  .katex .sizing.reset-size2.size1,
  .katex .fontsize-ensurer.reset-size2.size1 {
    font-size: 0.83333333em;
  }
  .katex .sizing.reset-size2.size2,
  .katex .fontsize-ensurer.reset-size2.size2 {
    font-size: 1em;
  }
  .katex .sizing.reset-size2.size3,
  .katex .fontsize-ensurer.reset-size2.size3 {
    font-size: 1.16666667em;
  }
  .katex .sizing.reset-size2.size4,
  .katex .fontsize-ensurer.reset-size2.size4 {
    font-size: 1.33333333em;
  }
  .katex .sizing.reset-size2.size5,
  .katex .fontsize-ensurer.reset-size2.size5 {
    font-size: 1.5em;
  }
  .katex .sizing.reset-size2.size6,
  .katex .fontsize-ensurer.reset-size2.size6 {
    font-size: 1.66666667em;
  }
  .katex .sizing.reset-size2.size7,
  .katex .fontsize-ensurer.reset-size2.size7 {
    font-size: 2em;
  }
  .katex .sizing.reset-size2.size8,
  .katex .fontsize-ensurer.reset-size2.size8 {
    font-size: 2.4em;
  }
  .katex .sizing.reset-size2.size9,
  .katex .fontsize-ensurer.reset-size2.size9 {
    font-size: 2.88em;
  }
  .katex .sizing.reset-size2.size10,
  .katex .fontsize-ensurer.reset-size2.size10 {
    font-size: 3.45666667em;
  }
  .katex .sizing.reset-size2.size11,
  .katex .fontsize-ensurer.reset-size2.size11 {
    font-size: 4.14666667em;
  }
  .katex .sizing.reset-size3.size1,
  .katex .fontsize-ensurer.reset-size3.size1 {
    font-size: 0.71428571em;
  }
  .katex .sizing.reset-size3.size2,
  .katex .fontsize-ensurer.reset-size3.size2 {
    font-size: 0.85714286em;
  }
  .katex .sizing.reset-size3.size3,
  .katex .fontsize-ensurer.reset-size3.size3 {
    font-size: 1em;
  }
  .katex .sizing.reset-size3.size4,
  .katex .fontsize-ensurer.reset-size3.size4 {
    font-size: 1.14285714em;
  }
  .katex .sizing.reset-size3.size5,
  .katex .fontsize-ensurer.reset-size3.size5 {
    font-size: 1.28571429em;
  }
  .katex .sizing.reset-size3.size6,
  .katex .fontsize-ensurer.reset-size3.size6 {
    font-size: 1.42857143em;
  }
  .katex .sizing.reset-size3.size7,
  .katex .fontsize-ensurer.reset-size3.size7 {
    font-size: 1.71428571em;
  }
  .katex .sizing.reset-size3.size8,
  .katex .fontsize-ensurer.reset-size3.size8 {
    font-size: 2.05714286em;
  }
  .katex .sizing.reset-size3.size9,
  .katex .fontsize-ensurer.reset-size3.size9 {
    font-size: 2.46857143em;
  }
  .katex .sizing.reset-size3.size10,
  .katex .fontsize-ensurer.reset-size3.size10 {
    font-size: 2.96285714em;
  }
  .katex .sizing.reset-size3.size11,
  .katex .fontsize-ensurer.reset-size3.size11 {
    font-size: 3.55428571em;
  }
  .katex .sizing.reset-size4.size1,
  .katex .fontsize-ensurer.reset-size4.size1 {
    font-size: 0.625em;
  }
  .katex .sizing.reset-size4.size2,
  .katex .fontsize-ensurer.reset-size4.size2 {
    font-size: 0.75em;
  }
  .katex .sizing.reset-size4.size3,
  .katex .fontsize-ensurer.reset-size4.size3 {
    font-size: 0.875em;
  }
  .katex .sizing.reset-size4.size4,
  .katex .fontsize-ensurer.reset-size4.size4 {
    font-size: 1em;
  }
  .katex .sizing.reset-size4.size5,
  .katex .fontsize-ensurer.reset-size4.size5 {
    font-size: 1.125em;
  }
  .katex .sizing.reset-size4.size6,
  .katex .fontsize-ensurer.reset-size4.size6 {
    font-size: 1.25em;
  }
  .katex .sizing.reset-size4.size7,
  .katex .fontsize-ensurer.reset-size4.size7 {
    font-size: 1.5em;
  }
  .katex .sizing.reset-size4.size8,
  .katex .fontsize-ensurer.reset-size4.size8 {
    font-size: 1.8em;
  }
  .katex .sizing.reset-size4.size9,
  .katex .fontsize-ensurer.reset-size4.size9 {
    font-size: 2.16em;
  }
  .katex .sizing.reset-size4.size10,
  .katex .fontsize-ensurer.reset-size4.size10 {
    font-size: 2.5925em;
  }
  .katex .sizing.reset-size4.size11,
  .katex .fontsize-ensurer.reset-size4.size11 {
    font-size: 3.11em;
  }
  .katex .sizing.reset-size5.size1,
  .katex .fontsize-ensurer.reset-size5.size1 {
    font-size: 0.55555556em;
  }
  .katex .sizing.reset-size5.size2,
  .katex .fontsize-ensurer.reset-size5.size2 {
    font-size: 0.66666667em;
  }
  .katex .sizing.reset-size5.size3,
  .katex .fontsize-ensurer.reset-size5.size3 {
    font-size: 0.77777778em;
  }
  .katex .sizing.reset-size5.size4,
  .katex .fontsize-ensurer.reset-size5.size4 {
    font-size: 0.88888889em;
  }
  .katex .sizing.reset-size5.size5,
  .katex .fontsize-ensurer.reset-size5.size5 {
    font-size: 1em;
  }
  .katex .sizing.reset-size5.size6,
  .katex .fontsize-ensurer.reset-size5.size6 {
    font-size: 1.11111111em;
  }
  .katex .sizing.reset-size5.size7,
  .katex .fontsize-ensurer.reset-size5.size7 {
    font-size: 1.33333333em;
  }
  .katex .sizing.reset-size5.size8,
  .katex .fontsize-ensurer.reset-size5.size8 {
    font-size: 1.6em;
  }
  .katex .sizing.reset-size5.size9,
  .katex .fontsize-ensurer.reset-size5.size9 {
    font-size: 1.92em;
  }
  .katex .sizing.reset-size5.size10,
  .katex .fontsize-ensurer.reset-size5.size10 {
    font-size: 2.30444444em;
  }
  .katex .sizing.reset-size5.size11,
  .katex .fontsize-ensurer.reset-size5.size11 {
    font-size: 2.76444444em;
  }
  .katex .sizing.reset-size6.size1,
  .katex .fontsize-ensurer.reset-size6.size1 {
    font-size: 0.5em;
  }
  .katex .sizing.reset-size6.size2,
  .katex .fontsize-ensurer.reset-size6.size2 {
    font-size: 0.6em;
  }
  .katex .sizing.reset-size6.size3,
  .katex .fontsize-ensurer.reset-size6.size3 {
    font-size: 0.7em;
  }
  .katex .sizing.reset-size6.size4,
  .katex .fontsize-ensurer.reset-size6.size4 {
    font-size: 0.8em;
  }
  .katex .sizing.reset-size6.size5,
  .katex .fontsize-ensurer.reset-size6.size5 {
    font-size: 0.9em;
  }
  .katex .sizing.reset-size6.size6,
  .katex .fontsize-ensurer.reset-size6.size6 {
    font-size: 1em;
  }
  .katex .sizing.reset-size6.size7,
  .katex .fontsize-ensurer.reset-size6.size7 {
    font-size: 1.2em;
  }
  .katex .sizing.reset-size6.size8,
  .katex .fontsize-ensurer.reset-size6.size8 {
    font-size: 1.44em;
  }
  .katex .sizing.reset-size6.size9,
  .katex .fontsize-ensurer.reset-size6.size9 {
    font-size: 1.728em;
  }
  .katex .sizing.reset-size6.size10,
  .katex .fontsize-ensurer.reset-size6.size10 {
    font-size: 2.074em;
  }
  .katex .sizing.reset-size6.size11,
  .katex .fontsize-ensurer.reset-size6.size11 {
    font-size: 2.488em;
  }
  .katex .sizing.reset-size7.size1,
  .katex .fontsize-ensurer.reset-size7.size1 {
    font-size: 0.41666667em;
  }
  .katex .sizing.reset-size7.size2,
  .katex .fontsize-ensurer.reset-size7.size2 {
    font-size: 0.5em;
  }
  .katex .sizing.reset-size7.size3,
  .katex .fontsize-ensurer.reset-size7.size3 {
    font-size: 0.58333333em;
  }
  .katex .sizing.reset-size7.size4,
  .katex .fontsize-ensurer.reset-size7.size4 {
    font-size: 0.66666667em;
  }
  .katex .sizing.reset-size7.size5,
  .katex .fontsize-ensurer.reset-size7.size5 {
    font-size: 0.75em;
  }
  .katex .sizing.reset-size7.size6,
  .katex .fontsize-ensurer.reset-size7.size6 {
    font-size: 0.83333333em;
  }
  .katex .sizing.reset-size7.size7,
  .katex .fontsize-ensurer.reset-size7.size7 {
    font-size: 1em;
  }
  .katex .sizing.reset-size7.size8,
  .katex .fontsize-ensurer.reset-size7.size8 {
    font-size: 1.2em;
  }
  .katex .sizing.reset-size7.size9,
  .katex .fontsize-ensurer.reset-size7.size9 {
    font-size: 1.44em;
  }
  .katex .sizing.reset-size7.size10,
  .katex .fontsize-ensurer.reset-size7.size10 {
    font-size: 1.72833333em;
  }
  .katex .sizing.reset-size7.size11,
  .katex .fontsize-ensurer.reset-size7.size11 {
    font-size: 2.07333333em;
  }
  .katex .sizing.reset-size8.size1,
  .katex .fontsize-ensurer.reset-size8.size1 {
    font-size: 0.34722222em;
  }
  .katex .sizing.reset-size8.size2,
  .katex .fontsize-ensurer.reset-size8.size2 {
    font-size: 0.41666667em;
  }
  .katex .sizing.reset-size8.size3,
  .katex .fontsize-ensurer.reset-size8.size3 {
    font-size: 0.48611111em;
  }
  .katex .sizing.reset-size8.size4,
  .katex .fontsize-ensurer.reset-size8.size4 {
    font-size: 0.55555556em;
  }
  .katex .sizing.reset-size8.size5,
  .katex .fontsize-ensurer.reset-size8.size5 {
    font-size: 0.625em;
  }
  .katex .sizing.reset-size8.size6,
  .katex .fontsize-ensurer.reset-size8.size6 {
    font-size: 0.69444444em;
  }
  .katex .sizing.reset-size8.size7,
  .katex .fontsize-ensurer.reset-size8.size7 {
    font-size: 0.83333333em;
  }
  .katex .sizing.reset-size8.size8,
  .katex .fontsize-ensurer.reset-size8.size8 {
    font-size: 1em;
  }
  .katex .sizing.reset-size8.size9,
  .katex .fontsize-ensurer.reset-size8.size9 {
    font-size: 1.2em;
  }
  .katex .sizing.reset-size8.size10,
  .katex .fontsize-ensurer.reset-size8.size10 {
    font-size: 1.44027778em;
  }
  .katex .sizing.reset-size8.size11,
  .katex .fontsize-ensurer.reset-size8.size11 {
    font-size: 1.72777778em;
  }
  .katex .sizing.reset-size9.size1,
  .katex .fontsize-ensurer.reset-size9.size1 {
    font-size: 0.28935185em;
  }
  .katex .sizing.reset-size9.size2,
  .katex .fontsize-ensurer.reset-size9.size2 {
    font-size: 0.34722222em;
  }
  .katex .sizing.reset-size9.size3,
  .katex .fontsize-ensurer.reset-size9.size3 {
    font-size: 0.40509259em;
  }
  .katex .sizing.reset-size9.size4,
  .katex .fontsize-ensurer.reset-size9.size4 {
    font-size: 0.46296296em;
  }
  .katex .sizing.reset-size9.size5,
  .katex .fontsize-ensurer.reset-size9.size5 {
    font-size: 0.52083333em;
  }
  .katex .sizing.reset-size9.size6,
  .katex .fontsize-ensurer.reset-size9.size6 {
    font-size: 0.5787037em;
  }
  .katex .sizing.reset-size9.size7,
  .katex .fontsize-ensurer.reset-size9.size7 {
    font-size: 0.69444444em;
  }
  .katex .sizing.reset-size9.size8,
  .katex .fontsize-ensurer.reset-size9.size8 {
    font-size: 0.83333333em;
  }
  .katex .sizing.reset-size9.size9,
  .katex .fontsize-ensurer.reset-size9.size9 {
    font-size: 1em;
  }
  .katex .sizing.reset-size9.size10,
  .katex .fontsize-ensurer.reset-size9.size10 {
    font-size: 1.20023148em;
  }
  .katex .sizing.reset-size9.size11,
  .katex .fontsize-ensurer.reset-size9.size11 {
    font-size: 1.43981481em;
  }
  .katex .sizing.reset-size10.size1,
  .katex .fontsize-ensurer.reset-size10.size1 {
    font-size: 0.24108004em;
  }
  .katex .sizing.reset-size10.size2,
  .katex .fontsize-ensurer.reset-size10.size2 {
    font-size: 0.28929605em;
  }
  .katex .sizing.reset-size10.size3,
  .katex .fontsize-ensurer.reset-size10.size3 {
    font-size: 0.33751205em;
  }
  .katex .sizing.reset-size10.size4,
  .katex .fontsize-ensurer.reset-size10.size4 {
    font-size: 0.38572806em;
  }
  .katex .sizing.reset-size10.size5,
  .katex .fontsize-ensurer.reset-size10.size5 {
    font-size: 0.43394407em;
  }
  .katex .sizing.reset-size10.size6,
  .katex .fontsize-ensurer.reset-size10.size6 {
    font-size: 0.48216008em;
  }
  .katex .sizing.reset-size10.size7,
  .katex .fontsize-ensurer.reset-size10.size7 {
    font-size: 0.57859209em;
  }
  .katex .sizing.reset-size10.size8,
  .katex .fontsize-ensurer.reset-size10.size8 {
    font-size: 0.69431051em;
  }
  .katex .sizing.reset-size10.size9,
  .katex .fontsize-ensurer.reset-size10.size9 {
    font-size: 0.83317261em;
  }
  .katex .sizing.reset-size10.size10,
  .katex .fontsize-ensurer.reset-size10.size10 {
    font-size: 1em;
  }
  .katex .sizing.reset-size10.size11,
  .katex .fontsize-ensurer.reset-size10.size11 {
    font-size: 1.19961427em;
  }
  .katex .sizing.reset-size11.size1,
  .katex .fontsize-ensurer.reset-size11.size1 {
    font-size: 0.20096463em;
  }
  .katex .sizing.reset-size11.size2,
  .katex .fontsize-ensurer.reset-size11.size2 {
    font-size: 0.24115756em;
  }
  .katex .sizing.reset-size11.size3,
  .katex .fontsize-ensurer.reset-size11.size3 {
    font-size: 0.28135048em;
  }
  .katex .sizing.reset-size11.size4,
  .katex .fontsize-ensurer.reset-size11.size4 {
    font-size: 0.32154341em;
  }
  .katex .sizing.reset-size11.size5,
  .katex .fontsize-ensurer.reset-size11.size5 {
    font-size: 0.36173633em;
  }
  .katex .sizing.reset-size11.size6,
  .katex .fontsize-ensurer.reset-size11.size6 {
    font-size: 0.40192926em;
  }
  .katex .sizing.reset-size11.size7,
  .katex .fontsize-ensurer.reset-size11.size7 {
    font-size: 0.48231511em;
  }
  .katex .sizing.reset-size11.size8,
  .katex .fontsize-ensurer.reset-size11.size8 {
    font-size: 0.57877814em;
  }
  .katex .sizing.reset-size11.size9,
  .katex .fontsize-ensurer.reset-size11.size9 {
    font-size: 0.69453376em;
  }
  .katex .sizing.reset-size11.size10,
  .katex .fontsize-ensurer.reset-size11.size10 {
    font-size: 0.83360129em;
  }
  .katex .sizing.reset-size11.size11,
  .katex .fontsize-ensurer.reset-size11.size11 {
    font-size: 1em;
  }
  .katex .delimsizing.size1 {
    font-family: KaTeX_Size1;
  }
  .katex .delimsizing.size2 {
    font-family: KaTeX_Size2;
  }
  .katex .delimsizing.size3 {
    font-family: KaTeX_Size3;
  }
  .katex .delimsizing.size4 {
    font-family: KaTeX_Size4;
  }
  .katex .delimsizing.mult .delim-size1 > span {
    font-family: KaTeX_Size1;
  }
  .katex .delimsizing.mult .delim-size4 > span {
    font-family: KaTeX_Size4;
  }
  .katex .nulldelimiter {
    display: inline-block;
    width: 0.12em;
  }
  .katex .delimcenter {
    position: relative;
  }
  .katex .op-symbol {
    position: relative;
  }
  .katex .op-symbol.small-op {
    font-family: KaTeX_Size1;
  }
  .katex .op-symbol.large-op {
    font-family: KaTeX_Size2;
  }
  .katex .op-limits > .vlist-t {
    text-align: center;
  }
  .katex .accent > .vlist-t {
    text-align: center;
  }
  .katex .accent .accent-body {
    position: relative;
  }
  .katex .accent .accent-body:not(.accent-full) {
    width: 0;
  }
  .katex .overlay {
    display: block;
  }
  .katex .mtable .vertical-separator {
    display: inline-block;
    min-width: 1px;
  }
  .katex .mtable .arraycolsep {
    display: inline-block;
  }
  .katex .mtable .col-align-c > .vlist-t {
    text-align: center;
  }
  .katex .mtable .col-align-l > .vlist-t {
    text-align: left;
  }
  .katex .mtable .col-align-r > .vlist-t {
    text-align: right;
  }
  .katex .svg-align {
    text-align: left;
  }
  .katex svg {
    display: block;
    position: absolute;
    width: 100%;
    height: inherit;
    fill: currentColor;
    stroke: currentColor;
    fill-rule: nonzero;
    fill-opacity: 1;
    stroke-width: 1;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 4;
    stroke-dasharray: none;
    stroke-dashoffset: 0;
    stroke-opacity: 1;
  }
  .katex svg path {
    stroke: none;
  }
  .katex img {
    border-style: none;
    min-width: 0;
    min-height: 0;
    max-width: none;
    max-height: none;
  }
  .katex .stretchy {
    width: 100%;
    display: block;
    position: relative;
    overflow: hidden;
  }
  .katex .stretchy::before,
  .katex .stretchy::after {
    content: "";
  }
  .katex .hide-tail {
    width: 100%;
    position: relative;
    overflow: hidden;
  }
  .katex .halfarrow-left {
    position: absolute;
    left: 0;
    width: 50.2%;
    overflow: hidden;
  }
  .katex .halfarrow-right {
    position: absolute;
    right: 0;
    width: 50.2%;
    overflow: hidden;
  }
  .katex .brace-left {
    position: absolute;
    left: 0;
    width: 25.1%;
    overflow: hidden;
  }
  .katex .brace-center {
    position: absolute;
    left: 25%;
    width: 50%;
    overflow: hidden;
  }
  .katex .brace-right {
    position: absolute;
    right: 0;
    width: 25.1%;
    overflow: hidden;
  }
  .katex .x-arrow-pad {
    padding: 0 0.5em;
  }
  .katex .cd-arrow-pad {
    padding: 0 0.55556em 0 0.27778em;
  }
  .katex .x-arrow,
  .katex .mover,
  .katex .munder {
    text-align: center;
  }
  .katex .boxpad {
    padding: 0 0.3em;
  }
  .katex .fbox,
  .katex .fcolorbox {
    box-sizing: border-box;
    border: 0.04em solid;
  }
  .katex .cancel-pad {
    padding: 0 0.2em;
  }
  .katex .cancel-lap {
    margin-left: -0.2em;
    margin-right: -0.2em;
  }
  .katex .sout {
    border-bottom-style: solid;
    border-bottom-width: 0.08em;
  }
  .katex .angl {
    box-sizing: border-box;
    border-top: 0.049em solid;
    border-right: 0.049em solid;
    margin-right: 0.03889em;
  }
  .katex .anglpad {
    padding: 0 0.03889em;
  }
  .katex .eqn-num::before {
    counter-increment: katexEqnNo;
    content: "(" counter(katexEqnNo) ")";
  }
  .katex .mml-eqn-num::before {
    counter-increment: mmlEqnNo;
    content: "(" counter(mmlEqnNo) ")";
  }
  .katex .mtr-glue {
    width: 50%;
  }
  .katex .cd-vert-arrow {
    display: inline-block;
    position: relative;
  }
  .katex .cd-label-left {
    display: inline-block;
    position: absolute;
    right: calc(50% + 0.3em);
    text-align: left;
  }
  .katex .cd-label-right {
    display: inline-block;
    position: absolute;
    left: calc(50% + 0.3em);
    text-align: right;
  }
  .katex-display {
    display: block;
    margin: 1em 0;
    text-align: center;
  }
  .katex-display > .katex {
    display: block;
    text-align: center;
    white-space: nowrap;
  }
  .katex-display > .katex > .katex-html {
    display: block;
    position: relative;
  }
  .katex-display > .katex > .katex-html > .tag {
    position: absolute;
    right: 0;
  }
  .katex-display.leqno > .katex > .katex-html > .tag {
    left: 0;
    right: auto;
  }
  .katex-display.fleqn > .katex {
    text-align: left;
    padding-left: 2em;
  }

  body {
    counter-reset: katexEqnNo mmlEqnNo;
  }

  /* == Math Nodes ======================================== */

  .math-node {
    min-width: 1em;
    min-height: 1em;
    font-size: 0.95em;
    font-family: "Consolas", "Ubuntu Mono", monospace;
    cursor: auto;
  }

  .math-node.empty-math .math-render::before {
    content: "(empty)";
    color: red;
  }
  
  .math-node .math-render.parse-error::before {
    content: "(math error)";
    color: red;
    cursor: help;
  }

  .math-node.ProseMirror-selectednode { outline: none; }

  .math-node .math-src {
    display: none;
    color: rgb(132, 33, 162);
    tab-size: 4;
  }

  .math-node.ProseMirror-selectednode .math-src { display: inherit; }
  .math-node.ProseMirror-selectednode .math-render:not(.math-preview) { display: none; }

  /* -- Inline Math --------------------------------------- */

  math-inline { display: inline; white-space: nowrap; }

  math-inline .math-render { 
    display: inline-block;
    font-size: 0.85em;
    cursor:pointer;
  }

  math-inline .math-src .ProseMirror {
    display: inline;
    /* Necessary to fix FireFox bug with contenteditable, https://bugzilla.mozilla.org/show_bug.cgi?id=1252108 */
    border-right: 1px solid transparent;
    border-left: 1px solid transparent;
  }

  math-inline .math-src::after, math-inline .math-src::before {
    content: "$";
    color: #b0b0b0;
  }

  /* -- Block Math ---------------------------------------- */

  math-display { display: block; }

  math-display .math-render { display: block; }

  math-display.ProseMirror-selectednode .math-src { background-color: #eee; }

  math-display .math-src .ProseMirror {
    width: 100%;
    display: block;
  }

  math-display .math-src::after, math-display .math-src::before {
    content: "$$";
    text-align: left;
    color: #b0b0b0;
  }

  math-display .katex-display { margin: 0; }

  /* -- Block Preview ------------------------------------- */

  math-display .math-render.math-preview {
    margin-bottom: 1em;
  }

  /* -- Selection Plugin ---------------------------------- */

  p::selection, p > *::selection { background-color: #c0c0c0; }
  .katex-html *::selection { background-color: none !important; }

  .math-node.math-select .math-render {
    background-color: #c0c0c0ff;
  }
  math-inline.math-select .math-render {
    padding-top: 2px;
  }

  /* == end Math Nodes ======================================== */

  /* -- abcjs plugin  audio  ---------------------------------- */ 

  .abcjs-inline-audio {
    height: 26px;
    padding: 0 5px;
    border-radius: 3px;
    background-color: #424242;
    display: flex;
    align-items: center;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio.abcjs-disabled {
    opacity: 0.5;
  }
  
  .abcjs-inline-audio .abcjs-btn {
    display: block;
    width: 28px;
    height: 34px;
    margin-right: 2px;
    padding: 7px 4px;
  
    background: none !important;
    border: 1px solid transparent;
    box-sizing: border-box;
    line-height: 1;
  }
  
  .abcjs-btn g {
    fill: #f4f4f4;
    stroke: #f4f4f4;
  }
  
  .abcjs-inline-audio .abcjs-btn:hover g {
    fill: #cccccc;
    stroke: #cccccc;
  }
  
  .abcjs-inline-audio .abcjs-midi-selection.abcjs-pushed {
    border: 1px solid #cccccc;
    background-color: #666666;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio .abcjs-midi-loop.abcjs-pushed {
    border: 1px solid #cccccc;
    background-color: #666666;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio .abcjs-midi-reset.abcjs-pushed {
    border: 1px solid #cccccc;
    background-color: #666666;
    box-sizing: border-box;
  }
  .abcjs-pause-svg, .abcjs-loading-svg, .abcjs-pause-svg {
    display: none !important;
  }

  .abcjs-inline-audio .abcjs-midi-start .abcjs-pause-svg {
    display: none;
  }
  
  .abcjs-inline-audio .abcjs-midi-start .abcjs-loading-svg {
    display: none;
  }
  
  .abcjs-inline-audio .abcjs-midi-start.abcjs-pushed .abcjs-play-svg {
    display: none;
  }
  
  .abcjs-inline-audio .abcjs-midi-start.abcjs-loading .abcjs-play-svg {
    display: none;
  }
  
  .abcjs-inline-audio .abcjs-midi-start.abcjs-pushed .abcjs-pause-svg {
    display: block;
  }
  
  .abcjs-inline-audio .abcjs-midi-progress-background {
    background-color: #424242;
    height: 10px;
    border-radius: 5px;
    border: 2px solid #cccccc;
    margin: 0 8px 0 15px;
    position: relative;
    flex: 1;
    padding: 0;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio .abcjs-midi-progress-indicator {
    width: 20px;
    margin-left: -10px; /* half of the width */
    height: 14px;
    background-color: #f4f4f4;
    position: absolute;
    display: inline-block;
    border-radius: 6px;
    top: -4px;
    left: 0;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio .abcjs-midi-clock {
    margin-left: 4px;
    margin-top: 1px;
    margin-right: 2px;
    display: inline-block;
    font-family: sans-serif;
    font-size: 16px;
    box-sizing: border-box;
    color: #f4f4f4;
  }
  
  .abcjs-inline-audio .abcjs-tempo-wrapper {
    font-size: 10px;
    color: #f4f4f4;
    box-sizing: border-box;
    display: flex;
    align-items: center;
  }
  
  .abcjs-inline-audio .abcjs-midi-tempo {
    border-radius: 2px;
    border: none;
    margin: 0 2px 0 4px;
    width: 42px;
    padding-left: 2px;
    box-sizing: border-box;
  }
  
  .abcjs-inline-audio .abcjs-loading .abcjs-loading-svg {
    display: inherit;
  }
  
  .abcjs-inline-audio .abcjs-loading {
    outline: none;
    animation-name: abcjs-spin;
    animation-duration: 1s;
    animation-iteration-count: infinite;
    animation-timing-function: linear;
  
  }
  .abcjs-inline-audio .abcjs-loading-svg circle {
    stroke: #f4f4f4;
  }
  
  @keyframes abcjs-spin {
    from {transform:rotate(0deg);}
    to {transform:rotate(360deg);}
  }
  
  /* Adding the class "abcjs-large" will make the control easier on a touch device. */
  .abcjs-large .abcjs-inline-audio {
    height: 52px;
  }
  .abcjs-large .abcjs-btn {
    width: 56px;
    height: 52px;
    font-size: 28px;
    padding: 6px 8px;
  }
  .abcjs-large .abcjs-midi-progress-background {
    height: 20px;
    border: 4px solid #cccccc;
  }
  .abcjs-large .abcjs-midi-progress-indicator {
    height: 28px;
    top: -8px;
    width: 40px;
  }
  .abcjs-large .abcjs-midi-clock {
    font-size: 32px;
    margin-right: 10px;
    margin-left: 10px;
    margin-top: -1px;
  }
  .abcjs-large .abcjs-midi-tempo {
    font-size: 20px;
    width: 50px;
  }
  .abcjs-large .abcjs-tempo-wrapper {
    font-size: 20px;
  }
  
  .abcjs-css-warning {
    display: none;
  }

  @media print {
    .placeholder:before,
    .slash-menu-trigger,
    .heading-actions,
    h1:not(.placeholder):before,
    h2:not(.placeholder):before,
    h3:not(.placeholder):before,
    h4:not(.placeholder):before,
    h5:not(.placeholder):before,
    h6:not(.placeholder):before {
      display: none;
    }

    .page-break {
      opacity: 0;
    }

    em,
    blockquote {
      font-family: "SF Pro Text", ${props => props.theme.fontFamily};
    }
  }
`;
