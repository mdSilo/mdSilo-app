import { EditorState } from "prosemirror-state";
import { parser } from "../server";
import Anchor from "./Anchor";

const anchors = (md: string, name: string, isNode = true) => {
  const plugin = Anchor(name, "anchor", isNode);
  const state = EditorState.create({
    doc: parser.parse(md),
    plugins: [plugin],
  });
  const read = (s: EditorState) =>
    plugin
      .getState(s)
      .find()
      .map((d) => ({ pos: d.from, id: d.spec.key }));
  return { state, read };
};

describe("Anchor", () => {
  test("heading anchors are unique, before each heading", () => {
    const md = "# Intro\n\ntext\n\n## Intro\n\n> # Quoted\n\n- # In list";
    const { state, read } = anchors(md, "heading");
    const headings: number[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") headings.push(pos);
    });
    expect(read(state)).toEqual([
      { pos: headings[0], id: "h-intro" },
      { pos: headings[1], id: "h-intro-1" },
      { pos: headings[2], id: "h-quoted" },
      { pos: headings[3], id: "h-in-list" },
    ]);
  });

  test("hashtag anchors are unique, before the block of the tag", () => {
    const md = "a #tag# and #tag# here\n\n> quoted #other#\n\nnone";
    const { state, read } = anchors(md, "hashtag", false);
    const blocks: number[] = [];
    state.doc.descendants((node, pos) => {
      const tagged = (n: typeof node) =>
        n.marks.some((m) => m.type.name === "hashtag");
      if (node.isTextblock && node.content.content.some(tagged)) {
        blocks.push(pos);
      }
    });
    const found = read(state);
    expect(found.map((a) => a.pos)).toEqual([blocks[0], blocks[0], blocks[1]]);
    expect(new Set(found.map((a) => a.id)).size).toBe(3);
  });

  test("anchors follow the doc changes, not selection changes", () => {
    const { state, read } = anchors("# One\n\ntext", "heading");
    const moved = state.apply(state.tr.setSelection(state.selection));
    const plugin = state.plugins[0];
    expect(plugin.getState(moved)).toBe(plugin.getState(state));

    const edited = state.apply(state.tr.insertText("Two ", 1));
    expect(read(edited)).toEqual([{ pos: 0, id: "h-two-one" }]);
  });
});
