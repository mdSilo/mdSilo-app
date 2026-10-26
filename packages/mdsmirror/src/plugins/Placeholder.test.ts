import { EditorState } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import { parser, schema } from "../server";
import Placeholder from "./Placeholder";

const decorationsOf = (doc = parser.parse("")) => {
  const [plugin] = new Placeholder({ placeholder: "Write…" }).plugins;
  const state = EditorState.create({ doc, plugins: [plugin] });
  const set = plugin.props.decorations?.call(plugin, state) as DecorationSet;
  return set.find();
};

describe("Placeholder", () => {
  test("shows the placeholder in an empty doc", () => {
    const [decoration] = decorationsOf();
    expect(decoration.from).toBe(0);
    expect(decoration.to).toBe(2);
    // @ts-expect-error attrs of a node decoration
    expect(decoration.type.attrs).toMatchObject({
      class: "placeholder",
      "data-empty-text": "Write…",
    });
  });

  test("no placeholder once there is any content", () => {
    expect(decorationsOf(parser.parse("a"))).toHaveLength(0);
    expect(decorationsOf(parser.parse("# "))).toHaveLength(0);
    expect(decorationsOf(parser.parse("---"))).toHaveLength(0);
    const twoEmpty = schema.node("doc", null, [
      schema.node("paragraph"),
      schema.node("paragraph"),
    ]);
    expect(decorationsOf(twoEmpty)).toHaveLength(0);
  });
});
