import { EditorState, TextSelection } from "prosemirror-state";
import { parser, serializer } from "./server";

/** Type `text` with the cursor right after the first `after` in `md`. */
const typeAfter = (md: string, after: string, text: string) => {
  const doc = parser.parse(md);
  let pos = -1;
  doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text?.includes(after)) {
      pos = p + (node.text.indexOf(after) + after.length);
    }
  });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  });
  return serializer.serialize(state.apply(state.tr.insertText(text)).doc);
};

describe("typing at the end of a mark", () => {
  test.each([
    ["H~2~ C", "2", "H~2~x C"],
    ["x^2^ C", "2", "x^2^x C"],
    ["~~del~~ C", "del", "~~del~~x C"],
    ["==hi== C", "hi", "==hi==x C"],
    ["!!name!! C", "name", "!!name!!x C"],
  ])("is not in %s", (md, after, typed) => {
    expect(typeAfter(md, after, "x")).toBe(typed);
  });

  test.each([
    ["**bold** C", "bold", "**boldx** C"],
    ["*it* C", "it", "*itx* C"],
    ["__u__ C", "u", "__ux__ C"],
  ])("is still in %s", (md, after, typed) => {
    expect(typeAfter(md, after, "x")).toBe(typed);
  });

  test("is in the mark inside it", () => {
    expect(typeAfter("H~23~ C", "2", "x")).toBe("H~2x3~ C");
  });
});
