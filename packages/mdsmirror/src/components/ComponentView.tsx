import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorView, Decoration } from "prosemirror-view";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ThemeProvider } from "styled-components";
import Extension from "../core/Extension";
import { ComponentProps } from "./types";
import { lightTheme, darkTheme } from "../styles/theme";
import Editor from "../index";

type Component = (props: ComponentProps) => React.ReactElement;

export default class ComponentView {
  component: Component;
  editor: Editor;
  extension: Extension;
  node: ProsemirrorNode;
  view: EditorView;
  getPos: () => number;
  decorations: Decoration[];
  theme: typeof lightTheme;
  isSelected = false;
  dom: HTMLElement | null;
  _root?: ReactDOM.Root;

  // See https://prosemirror.net/docs/ref/#view.NodeView
  constructor(
    component: Component,
    {
      editor,
      extension,
      node,
      view,
      getPos,
      decorations,
    }: {
      editor: Editor;
      extension: Extension;
      node: ProsemirrorNode;
      view: EditorView;
      getPos: () => number;
      decorations: Decoration[];
    }
  ) {
    this.component = component;
    this.editor = editor;
    this.extension = extension;
    this.getPos = getPos;
    this.decorations = decorations;
    this.node = node;
    this.view = view;
    this.dom = node.type.spec.inline
      ? document.createElement("span")
      : document.createElement("div");

    this.dom.classList.add(`component-${node.type.name}`);

    this.renderElement();
    window.addEventListener("theme-changed", this.renderElement);
  }

  renderElement = () => {
    const { dark } = this.editor.props;
    // Ensure theme is a complete DefaultTheme object
    const theme: typeof lightTheme = {
      ...((dark ? darkTheme : lightTheme)),
      ...(this.editor.props.theme || {}),
    };

    const children = this.component({
      theme,
      node: this.node,
      isSelected: this.isSelected,
      isEditable: this.view.editable,
      getPos: this.getPos,
    });
    if (this.dom) {
      if (!this._root) {
        this._root = ReactDOM.createRoot(this.dom);
      }
      this._root.render(
        <ThemeProvider theme={theme}>
          {children}
        </ThemeProvider>
      );
    }
  };

  update(node: ProsemirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.renderElement();
    return true;
  }

  selectNode() {
    if (this.view.editable) {
      this.isSelected = true;
      this.renderElement();
    }
  }

  deselectNode() {
    if (this.view.editable) {
      this.isSelected = false;
      this.renderElement();
    }
  }

  stopEvent(event: Event) {
    return event.type !== "mousedown" && !event.type.startsWith("drag");
  }

  destroy() {
    if (this._root) {
      this._root.unmount();
      this._root = undefined;
    }
    window.removeEventListener("theme-changed", this.renderElement);
    this.dom = null;
  }

  ignoreMutation() {
    return true;
  }
}
