import type { EditorView } from "@codemirror/view";

// Obsidian's `Editor`, the part plugins use most: the text, lines, the
// cursor and the selection, by `{ line, ch }` positions (0-based). Over the
// CodeMirror of the Markdown mode (`CmEditor`), or over the text of the
// note when it shows as WYSIWYG (`TextEditor`, saved after the command).

export type EditorPosition = { line: number; ch: number };
export type EditorRange = { from: EditorPosition; to: EditorPosition };
export type EditorSelection = { anchor: EditorPosition; head: EditorPosition };

export abstract class Editor {
  abstract getValue(): string;
  /** the selection, as offsets in the text */
  protected abstract sel(): { anchor: number; head: number };
  protected abstract change(
    from: number,
    to: number,
    text: string,
    select?: { anchor: number; head: number },
  ): void;
  protected abstract select(anchor: number, head: number): void;

  setValue(text: string) {
    this.change(0, this.getValue().length, text, { anchor: 0, head: 0 });
  }
  getLine(line: number) {
    return this.getValue().split("\n")[line] ?? "";
  }
  lineCount() {
    return this.getValue().split("\n").length;
  }
  lastLine() {
    return this.lineCount() - 1;
  }
  offsetToPos(offset: number): EditorPosition {
    const before = this.getValue().slice(0, Math.max(0, offset)).split("\n");
    return { line: before.length - 1, ch: before[before.length - 1].length };
  }
  posToOffset(pos: EditorPosition): number {
    const lines = this.getValue().split("\n");
    const line = Math.min(Math.max(0, pos.line), lines.length - 1);
    let offset = 0;
    for (let i = 0; i < line; i++) offset += lines[i].length + 1;
    return offset + Math.min(Math.max(0, pos.ch), lines[line].length);
  }
  getCursor(which: "from" | "to" | "head" | "anchor" = "head") {
    const { anchor, head } = this.sel();
    const at =
      which === "from"
        ? Math.min(anchor, head)
        : which === "to"
          ? Math.max(anchor, head)
          : which === "anchor"
            ? anchor
            : head;
    return this.offsetToPos(at);
  }
  setCursor(pos: EditorPosition | number, ch?: number) {
    const at = this.posToOffset(
      typeof pos === "number" ? { line: pos, ch: ch ?? 0 } : pos,
    );
    this.select(at, at);
  }
  setSelection(anchor: EditorPosition, head = anchor) {
    this.select(this.posToOffset(anchor), this.posToOffset(head));
  }
  listSelections(): EditorSelection[] {
    return [{ anchor: this.getCursor("anchor"), head: this.getCursor("head") }];
  }
  somethingSelected() {
    const { anchor, head } = this.sel();
    return anchor !== head;
  }
  getSelection() {
    const { anchor, head } = this.sel();
    return this.getValue().slice(
      Math.min(anchor, head),
      Math.max(anchor, head),
    );
  }
  replaceSelection(text: string) {
    const { anchor, head } = this.sel();
    const from = Math.min(anchor, head);
    const end = from + text.length;
    this.change(from, Math.max(anchor, head), text, {
      anchor: end,
      head: end,
    });
  }
  getRange(from: EditorPosition, to: EditorPosition) {
    return this.getValue().slice(this.posToOffset(from), this.posToOffset(to));
  }
  replaceRange(text: string, from: EditorPosition, to = from) {
    this.change(this.posToOffset(from), this.posToOffset(to), text);
  }
  getDoc() {
    return this;
  }
  focus() {}
  blur() {}
  refresh() {}
}

/** The editor of the Markdown mode: Obsidian's editor is CodeMirror too */
export class CmEditor extends Editor {
  constructor(public cm: EditorView) {
    super();
  }
  getValue() {
    return this.cm.state.doc.toString();
  }
  protected sel() {
    const { anchor, head } = this.cm.state.selection.main;
    return { anchor, head };
  }
  protected change(
    from: number,
    to: number,
    text: string,
    select?: { anchor: number; head: number },
  ) {
    this.cm.dispatch({
      changes: { from, to, insert: text },
      ...(select ? { selection: select } : {}),
    });
  }
  protected select(anchor: number, head: number) {
    this.cm.dispatch({ selection: { anchor, head } });
  }
  focus() {
    this.cm.focus();
  }
}

/**
 * The text of the note shown as WYSIWYG: the selection is the text
 * selected on the page, found in the note (the first one); `save` writes
 * it once the command is done, if it changed.
 */
export class TextEditor extends Editor {
  private anchor: number;
  private head: number;
  private dirty = false;
  constructor(
    private text: string,
    private write: (text: string) => Promise<void>,
    selected = globalThis.getSelection?.()?.toString() ?? "",
  ) {
    super();
    const at = selected ? text.indexOf(selected) : -1;
    this.anchor = at >= 0 ? at : text.length;
    this.head = at >= 0 ? at + selected.length : text.length;
  }
  getValue() {
    return this.text;
  }
  protected sel() {
    return { anchor: this.anchor, head: this.head };
  }
  protected change(
    from: number,
    to: number,
    text: string,
    select?: { anchor: number; head: number },
  ) {
    this.text = this.text.slice(0, from) + text + this.text.slice(to);
    this.dirty = true;
    const shift = (at: number) =>
      at <= from ? at : at >= to ? at + text.length - (to - from) : from;
    if (select) this.select(select.anchor, select.head);
    else this.select(shift(this.anchor), shift(this.head));
  }
  protected select(anchor: number, head: number) {
    this.anchor = anchor;
    this.head = head;
  }
  async save() {
    if (this.dirty) await this.write(this.text);
    this.dirty = false;
  }
}
