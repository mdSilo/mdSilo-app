// MODIFIED FORM: https://github.com/codemirror/theme-one-dark/blob/main/src/one-dark.ts
// LICENSE: MIT License Copyright (C) 2018-2021 by Marijn Haverbeke <marijnh@gmail.com> and others

import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Using https://github.com/one-dark/vscode-one-dark-theme/ as reference for the colors

// the colors of the daisyUI theme, so the code editor follows any theme
const v = (name: string) => `var(--color-${name})`;
const mix = (name: string, percent: number) =>
  `color-mix(in oklch, var(--color-${name}) ${percent}%, transparent)`;

const chalky = v("warning"),
  coral = v("error"),
  cyan = v("info"),
  invalid = v("error-content"),
  ivory = v("base-content"),
  stone = mix("base-content", 55),
  malibu = v("secondary"),
  sage = v("success"),
  whiskey = v("accent"),
  violet = v("primary"),
  darkBackground = v("base-200"),
  highlightBackground = mix("base-content", 6),
  background = v("base-100"),
  tooltipBackground = v("base-200"),
  selection = mix("primary", 25),
  cursor = v("base-content");

// The editor theme styles, after One Dark, in the colors of the app theme.
const themeStyles = {
  "&": {
    color: ivory,
    backgroundColor: background,
  },

  ".cm-content": {
    caretColor: cursor,
  },

  ".cm-cursor, .cm-dropCursor": { borderLeftColor: cursor },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: selection },

  ".cm-panels": { backgroundColor: darkBackground, color: ivory },
  ".cm-panels.cm-panels-top": { borderBottom: `2px solid ${v("base-300")}` },
  ".cm-panels.cm-panels-bottom": { borderTop: `2px solid ${v("base-300")}` },

  ".cm-searchMatch": {
    backgroundColor: mix("warning", 35),
    outline: `1px solid ${v("warning")}`,
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: mix("warning", 20),
  },

  ".cm-activeLine": { backgroundColor: highlightBackground },
  ".cm-selectionMatch": { backgroundColor: mix("success", 15) },

  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: mix("info", 25),
    outline: `1px solid ${stone}`,
  },

  ".cm-gutters": {
    backgroundColor: background,
    color: stone,
    border: "none",
  },

  ".cm-activeLineGutter": {
    backgroundColor: highlightBackground,
  },

  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: stone,
  },

  ".cm-tooltip": {
    border: "none",
    backgroundColor: tooltipBackground,
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: tooltipBackground,
    borderBottomColor: tooltipBackground,
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: highlightBackground,
      color: ivory,
    },
  },
};

export const oneDarkTheme = EditorView.theme(themeStyles, { dark: true });
export const oneLightTheme = EditorView.theme(themeStyles, { dark: false });

// The highlighting style for code in the One Dark theme.
export const oneDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: violet },
  {
    tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
    color: coral,
  },
  { tag: [t.function(t.variableName), t.labelName], color: malibu },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: whiskey },
  { tag: [t.definition(t.name), t.separator], color: ivory },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: chalky,
  },
  {
    tag: [
      t.operator,
      t.operatorKeyword,
      t.url,
      t.escape,
      t.regexp,
      t.link,
      t.special(t.string),
    ],
    color: cyan,
  },
  { tag: [t.meta, t.comment], color: stone },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: stone, textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: coral },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: whiskey },
  { tag: [t.processingInstruction, t.string, t.inserted], color: sage },
  { tag: t.invalid, color: invalid },
]);

// Extension to enable the One Dark theme (both the editor theme and
// the highlight style).
export const oneDark: Extension = [
  oneDarkTheme,
  syntaxHighlighting(oneDarkHighlightStyle),
];
export const oneLight: Extension = [
  oneLightTheme,
  syntaxHighlighting(oneDarkHighlightStyle),
];
