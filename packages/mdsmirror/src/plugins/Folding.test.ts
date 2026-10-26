import { EditorState, TextSelection } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import { parser } from "../server";
import Folding from "./Folding";

const setup = (md: string) => {
  const [plugin] = new Folding().plugins;
  const state = EditorState.create({
    doc: parser.parse(md),
    plugins: [plugin],
  });
  const folded = (s: EditorState) =>
    (plugin.getState(s) as DecorationSet)
      .find()
      .map((d) => s.doc.nodeAt(d.from)?.textContent);
  return { plugin, state, folded };
};

const collapse = (state: EditorState, heading: string) => {
  let pos = -1;
  state.doc.forEach((node, offset) => {
    if (node.type.name === "heading" && node.textContent === heading) {
      pos = offset;
    }
  });
  const node = state.doc.nodeAt(pos);
  return state.apply(
    state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, collapsed: true })
  );
};

const md = "# A\n\na1\n\n## A.1\n\na2\n\n# B\n\nb1";

describe("Folding", () => {
  test("folds the content of a collapsed heading, to the next one as high", () => {
    const { state, folded } = setup(md);
    expect(folded(state)).toEqual([]);
    expect(folded(collapse(state, "A"))).toEqual(["a1", "A.1", "a2"]);
    expect(folded(collapse(state, "A.1"))).toEqual(["a2"]);
  });

  test("keeps the decorations on selection changes", () => {
    const { plugin, state } = setup(md);
    const collapsed = collapse(state, "A");
    const moved = collapsed.apply(
      collapsed.tr.setSelection(TextSelection.create(collapsed.doc, 1))
    );
    expect(plugin.getState(moved)).toBe(plugin.getState(collapsed));
  });
});
