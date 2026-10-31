import { Schema } from "prosemirror-model";
import {
  AllSelection,
  EditorState,
  NodeSelection,
  Selection,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { parser, schema as baseSchema } from "./server";
import attachFiles from "./core/commands/attachFiles";

const flush = () => new Promise((r) => setTimeout(r, 0));

// the server schema has no attachment node
const schema = new Schema({
  nodes: baseSchema.spec.nodes.addToEnd("attachment", {
    attrs: { href: { default: null }, title: {}, size: {} },
    group: "block",
    atom: true,
    toDOM: () => ["div"],
  }),
  marks: baseSchema.spec.marks,
});

const setup = (
  md: string,
  at: number | ((doc: EditorState["doc"]) => Selection)
) => {
  const doc = schema.nodeFromJSON(parser.parse(md).toJSON());
  const selection =
    typeof at === "number" ? TextSelection.create(doc, at) : at(doc);
  const state = EditorState.create({ doc, schema, selection });
  return new EditorView(document.createElement("div"), { state });
};

// images never load in jsdom: fire onload/onerror by hand
let loaders: Array<(ok: boolean) => void> = [];
const loadImage = (ok: boolean) => loaders.forEach((load) => load(ok));
beforeEach(() => {
  loaders = [];
  // @ts-ignore
  global.Image = class {
    onload: () => void = () => undefined;
    onerror: () => void = () => undefined;
    set src(_: string) {
      loaders.push((ok) => (ok ? this.onload() : this.onerror()));
    }
  };
});

const png = (src: string) => ({ type: "image/png", name: src, size: 1, src });
const pdf = (src: string) => ({
  type: "application/pdf",
  name: src,
  size: 1,
  src,
});

const attach = (
  view: EditorView,
  files = [png("./assets/a.png")],
  replaceExisting = false
) =>
  attachFiles(view, 999 /* stale pos, ignored */, {
    accept: "*",
    attachFile: async () => files,
    replaceExisting,
  });

describe("attachFiles", () => {
  test("puts an image in its own paragraph after the current one", async () => {
    const view = setup("hello world", 3);
    attach(view);
    await flush();
    loadImage(true);
    await flush();
    const doc = view.state.doc;
    // and an empty paragraph to go on typing below
    expect(doc.childCount).toBe(3);
    expect(doc.child(1).firstChild?.type.name).toBe("image");
    expect(doc.child(1).firstChild?.attrs.src).toBe("./assets/a.png");
  });

  test("inserts the image even if it fails to load", async () => {
    const view = setup("", 1);
    attach(view);
    await flush();
    loadImage(false);
    await flush();
    expect(view.state.doc.firstChild?.firstChild?.type.name).toBe("image");
  });

  test("inserts at the selection when the file is picked", async () => {
    const view = setup("one\n\ntwo", 2);
    attach(view);
    // the doc changes while picking the file
    view.dispatch(view.state.tr.insertText("more ", 1));
    await flush();
    loadImage(true);
    await flush();
    const texts: string[] = [];
    view.state.doc.forEach((n) => texts.push(n.firstChild?.type.name ?? ""));
    expect(texts).toEqual(["text", "image", "text"]);
  });

  test("never overwrites the selected text or blocks", async () => {
    let view = setup("hello world", (doc) => TextSelection.create(doc, 2, 8));
    attach(view, [pdf("./a.pdf")]);
    await flush();
    expect(view.state.doc.toString()).toBe(
      'doc(paragraph("hello world"), attachment, paragraph)'
    );

    view = setup("a\n\n---\n\nb", (doc) => NodeSelection.create(doc, 3));
    attach(view, [pdf("./a.pdf")]);
    await flush();
    expect(view.state.doc.toString()).toBe(
      'doc(paragraph("a"), hr, attachment, paragraph("b"))'
    );

    view = setup("a\n\nb", (doc) => new AllSelection(doc));
    attach(view);
    await flush();
    loadImage(true);
    await flush();
    expect(view.state.doc.toString()).toBe(
      'doc(paragraph("a"), paragraph("b"), paragraph(image), paragraph)'
    );
  });

  test("puts an attachment after the paragraph, not splitting it", async () => {
    const view = setup("hello world\n\nnext", 3);
    attach(view, [pdf("./a.pdf"), pdf("./b.pdf")]);
    await flush();
    const hrefs: string[] = [];
    view.state.doc.forEach((n) => hrefs.push(n.attrs.href ?? n.textContent));
    expect(hrefs).toEqual(["hello world", "./a.pdf", "./b.pdf", "next"]);
  });

  test("inserts the files in the picked order", async () => {
    const view = setup("hello", 3);
    attach(view, [png("./a.png"), png("./b.png")]);
    await flush();
    loaders[1](true);
    loaders[0](false);
    await flush();
    const srcs: string[] = [];
    view.state.doc.forEach((n) => srcs.push(n.firstChild?.attrs.src ?? ""));
    expect(srcs).toEqual(["", "./a.png", "./b.png", ""]);
  });

  test("replaces the selected image, keeping its attrs", async () => {
    const view = setup('![alt](./old.png "right-50")', (doc) =>
      NodeSelection.create(doc, 1)
    );
    attach(view, [png("./new.png"), png("./more.png")], true);
    await flush();
    loadImage(true);
    await flush();
    const images: string[] = [];
    view.state.doc.descendants((n) => {
      if (n.type.name === "image") images.push(`${n.attrs.alt} ${n.attrs.src}`);
    });
    expect(images).toEqual(["alt ./new.png", "null ./more.png"]);
  });
});
