// TODO: use codemirror
import copy from "copy-to-clipboard";
import { Token } from "markdown-it";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import { NodeSpec, NodeType, Schema, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, EditorState, Selection, TextSelection, Transaction } from "prosemirror-state";
import refractor from "refractor/core";
import bash from "refractor/lang/bash";
import cpp from "refractor/lang/cpp";
import clike from "refractor/lang/clike";
import csharp from "refractor/lang/csharp";
import css from "refractor/lang/css";
import elixir from "refractor/lang/elixir";
import go from "refractor/lang/go";
import java from "refractor/lang/java";
import javascript from "refractor/lang/javascript";
import json from "refractor/lang/json";
import kotlin from "refractor/lang/kotlin";
import lua from "refractor/lang/lua";
import markup from "refractor/lang/markup";
import objectivec from "refractor/lang/objectivec";
import perl from "refractor/lang/perl";
import php from "refractor/lang/php";
import powershell from "refractor/lang/powershell";
import python from "refractor/lang/python";
import r from "refractor/lang/r";
import ruby from "refractor/lang/ruby";
import rust from "refractor/lang/rust";
import sql from "refractor/lang/sql";
import swift from "refractor/lang/swift";
import typescript from "refractor/lang/typescript";
import yaml from "refractor/lang/yaml";

import toggleBlockType from "../core/commands/toggleBlockType";
import { MarkdownSerializerState } from "../core/mdSerializer";
import Diagram from "../plugins/Diagram";
import Prism, { LANGUAGES } from "../plugins/Prism";
import isInCode from "../core/queries/isInCode";
import { Dispatch } from "../types";
import Node from "./Node";

const DEFAULT_LANGUAGE = "javascript";

[
  bash,
  css,
  clike,
  cpp,
  csharp,
  elixir,
  go,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markup,
  objectivec,
  perl,
  php,
  python,
  powershell,
  r,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  yaml,
].forEach(refractor.register);

export default class CodeFence extends Node {
  constructor(options: Record<string, any> = {dark: false}) {
    super(options);
  }

  get languageOptions() {
    return Object.entries(LANGUAGES);
  }

  get name() {
    return "code_fence";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        language: {
          default: DEFAULT_LANGUAGE,
        },
      },
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      draggable: false,
      parseDOM: [
        { tag: "code" },
        { tag: "pre", preserveWhitespace: "full" },
        {
          tag: ".code-block",
          preserveWhitespace: "full",
          contentElement: "code",
          getAttrs: (dom: HTMLDivElement) => {
            return {
              language: dom.dataset.language,
            };
          },
        },
      ],
      toDOM: (node) => {
        let actions: any;
        if (typeof document !== "undefined") {
          const copy = document.createElement("button");
          copy.innerText = "Copy";
          copy.type = "button";
          copy.addEventListener("click", this.handleCopyToClipboard);

          const select = document.createElement("select");
          this.languageOptions.forEach(([key, label]) => {
            const option = document.createElement("option");
            const value = key === "none" ? "" : key;
            option.value = value;
            option.innerText = label;
            const selected = node.attrs.language === value;
            option.selected = selected;
            select.appendChild(option);
          });
          select.addEventListener("change", this.handleLanguageChange);

          actions = document.createElement("div");
          actions.className = "code-actions";
          actions.appendChild(select);
          actions.appendChild(copy);

          // For the diagram language we add an extra button to toggle between
          // source code and a rendered diagram view.
          const lang = node.attrs.language;
          if (lang === "mermaid" || lang === "echarts" || lang === 'abcjs') {
            const showSourceButton = document.createElement("button");
            showSourceButton.innerText = "Source";
            showSourceButton.type = "button";
            showSourceButton.classList.add("show-source-button");
            showSourceButton.addEventListener(
              "click",
              (e: InputEvent) => this.handleToggleDiagram(e, lang)
            );
            actions.prepend(showSourceButton);

            const showDiagramButton = document.createElement("button");
            showDiagramButton.innerText = "Diagram";
            showDiagramButton.type = "button";
            showDiagramButton.classList.add("show-diagram-button");
            showDiagramButton.addEventListener(
              "click",
              (e: InputEvent) => this.handleToggleDiagram(e, lang)
            );
            actions.prepend(showDiagramButton);
          }
        }

        return [
          "div",
          { class: `code-block ${this.options.showLineNumber ? "with-line-numbers" : ""}`, 
            "data-language": node.attrs.language 
          },
          ...(actions ? [["div", { contentEditable: "false" }, actions]] : []),
          ["pre", ["code", { spellCheck: "false" }, 0]],
        ];
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      code_block: (attrs: Record<string, any>) => {
        return toggleBlockType(type, schema.nodes.paragraph, {
          language: DEFAULT_LANGUAGE,
          ...attrs,
        });
      },
    };
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      "Alt-.": toggleBlockType(type, schema.nodes.paragraph),
      "Shift-Enter": (state: EditorState, dispatch: Dispatch) => {
        if (!isInCode(state)) {
          return false;
        }
        const { tr, selection } = state;
        const text = selection?.$anchor?.nodeBefore?.text;
        let newText = "\n";

        if (text) {
          const splitByNewLine = text.split("\n");
          const offset = splitByNewLine[splitByNewLine.length - 1].search(/\S|$/);
          newText += " ".repeat(offset);
        }

        dispatch(tr.insertText(newText, selection.from, selection.to));
        return true;
      },
      Tab: (state: EditorState, dispatch: Dispatch) => {
        if (!isInCode(state)) {
          return false;
        }

        const { tr, selection } = state;
        dispatch(tr.insertText("  ", selection.from, selection.to));
        return true;
      },
    };
  }

  handleCopyToClipboard = (event: MouseEvent) => {
    const { view } = this.editor;
    const element = event.target;
    if (!(element instanceof HTMLButtonElement)) {
      return;
    }
    const { top, left } = element.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });

    if (result) {
      const node = view.state.doc.nodeAt(result.pos);
      if (node) {
        copy(node.textContent);
      }
    }
  };

  handleLanguageChange = (event: InputEvent) => {
    const { view } = this.editor;
    const { tr } = view.state;
    const element = event.currentTarget;
    if (!(element instanceof HTMLSelectElement)) {
      return;
    }

    const { top, left } = element.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });

    if (result) {
      const language = element.value;
      const transaction = tr
        .setSelection(Selection.near(view.state.doc.resolve(result.inside)))
        .setNodeMarkup(result.inside, undefined, { language });

      view.dispatch(transaction);
    }
  };

  handleToggleDiagram = (event: InputEvent, lang: string) => {
    const { view } = this.editor;
    const { tr } = view.state;
    const element = event.currentTarget;
    if (!(element instanceof HTMLButtonElement)) {
      return;
    }

    const { top, left } = element.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });

    if (!result) {
      return;
    }

    const diagramId = element.closest(".code-block")?.getAttribute("data-diagram-id");
    if (!diagramId) {
      return;
    }

    const transaction = tr.setMeta(lang, { toggleDiagram: diagramId });
    view.dispatch(transaction);
  };

  get plugins() {
    return [
      Prism({ name: this.name, lineNumbers: this.options.showLineNumber }),
      Diagram({ 
        pluginKey: 'mermaid', 
        name: this.name, 
        dark: this.options.dark, 
        onSave: this.options.onSaveDiagram 
      }),
      Diagram({ 
        pluginKey: 'echarts', 
        name: this.name, 
        dark: this.options.dark, 
        onSave: this.options.onSaveDiagram
      }),
      Diagram({ 
        pluginKey: 'abcjs', 
        name: this.name, 
        dark: this.options.dark,
        onSave: this.options.onSaveDiagram 
      }),
    ];
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      textblockTypeInputRule(/^```$/, type, () => ({
        language: DEFAULT_LANGUAGE,
      })),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write("```" + (node.attrs.language || "") + "\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "fence";
  }

  parseMarkdown() {
    return {
      block: "code_block",
      getAttrs: (tok: Token) => ({ language: tok.info }),
    };
  }
}
