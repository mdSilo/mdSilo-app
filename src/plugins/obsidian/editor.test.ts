import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CmEditor, TextEditor } from "./editor";

describe("TextEditor", () => {
  it("finds the text selected, and edits by positions", async () => {
    const write = vi.fn(async () => undefined);
    const editor = new TextEditor("one\ntwo three\nfour", write, "three");
    expect(editor.getSelection()).toBe("three");
    expect(editor.getCursor("from")).toEqual({ line: 1, ch: 4 });
    expect(editor.getCursor()).toEqual({ line: 1, ch: 9 });
    expect(editor.lineCount()).toBe(3);
    expect(editor.getLine(2)).toBe("four");
    editor.replaceSelection("3");
    expect(editor.getValue()).toBe("one\ntwo 3\nfour");
    expect(editor.getCursor()).toEqual({ line: 1, ch: 5 });
    expect(editor.somethingSelected()).toBe(false);
    editor.replaceRange("ONE", { line: 0, ch: 0 }, { line: 0, ch: 3 });
    expect(editor.getRange({ line: 0, ch: 0 }, { line: 0, ch: 3 })).toBe("ONE");
    // the cursor after the change stays where it was in the text
    expect(editor.getCursor()).toEqual({ line: 1, ch: 5 });
    await editor.save();
    expect(write).toHaveBeenCalledWith("ONE\ntwo 3\nfour");
    await editor.save();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("puts the cursor at the end without a selection found, writes nothing unchanged", async () => {
    const write = vi.fn(async () => undefined);
    const editor = new TextEditor("ab\ncd", write, "zz");
    expect(editor.getCursor()).toEqual({ line: 1, ch: 2 });
    editor.setCursor(0, 1);
    expect(editor.posToOffset(editor.getCursor())).toBe(1);
    await editor.save();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("CmEditor", () => {
  it("edits the CodeMirror view", () => {
    const cm = new EditorView({
      state: EditorState.create({ doc: "hello world" }),
      parent: document.body,
    });
    const editor = new CmEditor(cm);
    editor.setSelection({ line: 0, ch: 6 }, { line: 0, ch: 11 });
    expect(editor.getSelection()).toBe("world");
    editor.replaceSelection("there");
    expect(cm.state.doc.toString()).toBe("hello there");
    expect(editor.getCursor()).toEqual({ line: 0, ch: 11 });
    editor.setValue("x\ny");
    expect(editor.lastLine()).toBe(1);
    expect(editor.cm).toBe(cm);
    cm.destroy();
  });
});
