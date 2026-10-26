import { EditorState, TextSelection } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import { Node } from "prosemirror-model";
import { refractor } from "refractor/core";
// registers the languages of the code blocks
import { parser } from "../server";
import Prism, { getDecorations } from "./Prism";

const md =
  "text\n\n```javascript\nconst a = 1;\n```\n\n```python\ndef f(): pass\n```";

/** [text, classes] of the highlighted ranges */
const highlighted = (doc: Node, set: DecorationSet) =>
  set.find().map((d) => [
    doc.textBetween(d.from, d.to),
    // @ts-expect-error attrs of an inline decoration
    d.type.attrs.class,
  ]);

const setup = () => {
  const plugin = Prism({ name: "code_block" });
  let state = EditorState.create({ doc: parser.parse(md), plugins: [plugin] });
  // the first highlighting is deferred after the mount, by any transaction
  state = state.apply(state.tr.setMeta("prism", { loaded: true }));
  return { plugin, state };
};

/** Put the cursor at the end of the code of the nth code block */
const inCode = (state: EditorState, nth: number) => {
  const ends: number[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name === "code_block") ends.push(offset + node.nodeSize - 1);
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, ends[nth]))
  );
};

describe("Prism", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("highlights the code blocks of a registered language", () => {
    const { plugin, state } = setup();
    const found = highlighted(
      state.doc,
      plugin.getState(state) as DecorationSet
    );
    expect(found).toContainEqual(["const", "token keyword"]);
    expect(found).toContainEqual(["1", "token number"]);
    expect(found).toContainEqual(["def", "token keyword"]);
    expect(found).toContainEqual(["f", "token function"]);
  });

  test("highlights again the edited block only, the others moved", () => {
    const { plugin, state } = setup();
    const highlight = vi.spyOn(refractor, "highlight");
    let edited = inCode(state, 0);
    edited = edited.apply(edited.tr.insertText(" // more"));

    expect(highlight).toHaveBeenCalledTimes(1);
    const found = highlighted(
      edited.doc,
      plugin.getState(edited) as DecorationSet
    );
    expect(found).toContainEqual(["// more", "token comment"]);
    // the python block moved: its highlighting is at its new position
    expect(found).toEqual(
      highlighted(
        edited.doc,
        getDecorations({
          doc: edited.doc,
          name: "code_block",
          cache: new WeakMap(),
        })
      )
    );
  });

  test("line numbers when asked", () => {
    const set = getDecorations({
      doc: parser.parse("```javascript\na\nb\nc\n```"),
      name: "code_block",
      lineNumbers: true,
      cache: new WeakMap(),
    });
    const lines = set
      .find()
      // @ts-expect-error attrs of a node decoration
      .map((d) => d.type.attrs["data-line-numbers"])
      .filter(Boolean);
    expect(lines).toEqual(["1 \n2 \n3 "]);
  });

  test("not highlighted: no or unknown language", () => {
    const set = getDecorations({
      doc: parser.parse("```\nconst a\n```\n\n```nolang\nconst a\n```"),
      name: "code_block",
      cache: new WeakMap(),
    });
    expect(set.find()).toHaveLength(0);
  });
});
