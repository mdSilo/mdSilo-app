import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { parser, schema } from "./server";
import attachFiles from "./core/commands/attachFiles";

const flush = () => new Promise((r) => setTimeout(r, 0));

const setup = (md: string, at: number) => {
  const doc = parser.parse(md);
  let state = EditorState.create({ doc, schema });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, at))
  );
  return new EditorView(document.createElement("div"), { state });
};

// images never load in jsdom: fire onload/onerror by hand
let loadImage: (ok: boolean) => void = () => undefined;
beforeEach(() => {
  // @ts-ignore
  global.Image = class {
    onload: () => void = () => undefined;
    onerror: () => void = () => undefined;
    set src(_: string) {
      loadImage = (ok) => (ok ? this.onload() : this.onerror());
    }
  };
});

const attach = (view: EditorView, src = "./assets/a.png") =>
  attachFiles(view, 999 /* stale pos, ignored */, {
    accept: "image/*",
    attachFile: async () => [
      { type: "image/png", name: "a.png", size: 1, src },
    ],
  });

describe("attachFiles", () => {
  test("puts an image in its own paragraph after the current one", async () => {
    const view = setup("hello world", 3);
    attach(view);
    await flush();
    loadImage(true);
    const doc = view.state.doc;
    expect(doc.childCount).toBe(2);
    expect(doc.child(1).firstChild?.type.name).toBe("image");
    expect(doc.child(1).firstChild?.attrs.src).toBe("./assets/a.png");
  });

  test("inserts the image even if it fails to load", async () => {
    const view = setup("", 1);
    attach(view);
    await flush();
    loadImage(false);
    expect(view.state.doc.firstChild?.firstChild?.type.name).toBe("image");
  });

  test("inserts at the selection when the file is picked", async () => {
    const view = setup("one\n\ntwo", 2);
    attach(view);
    // the doc changes while picking the file
    view.dispatch(view.state.tr.insertText("more ", 1));
    await flush();
    loadImage(true);
    const texts: string[] = [];
    view.state.doc.forEach((n) => texts.push(n.firstChild?.type.name ?? ""));
    expect(texts).toEqual(["text", "image", "text"]);
  });
});
