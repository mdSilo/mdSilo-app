import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { parser } from "../server";
import Diagram from "./Diagram";

const render = vi.fn(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: (id: string) => render(id) },
}));

const md = [
  "```mermaid\ngraph TD; A-->B;\n```",
  "```javascript\nconst a = 1;\n```",
  "```mermaid\ngraph TD; C-->D;\n```",
].join("\n\n");

/** Put the cursor at the end of the code of the nth code block */
const inCode = (view: EditorView, nth: number) => {
  const ends: number[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.type.name === "code_block") ends.push(offset + node.nodeSize - 1);
  });
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, ends[nth]))
  );
};

// longer than the deferred first drawing, and the import of mermaid
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("Diagram", () => {
  let view: EditorView;

  beforeEach(async () => {
    render.mockClear();
    const plugin = Diagram({
      pluginKey: "mermaid",
      name: "code_block",
      dark: false,
    });
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ doc: parser.parse(md), plugins: [plugin] }),
    });
    // the first drawing is deferred after the mount
    await settle();
  });

  afterEach(() => {
    view.destroy();
  });

  test("draws each mermaid block", () => {
    expect(render).toHaveBeenCalledTimes(2);
    expect(
      view.dom.querySelectorAll(".mermaid-diagram-wrapper svg")
    ).toHaveLength(2);
  });

  test("editing other code does not draw the diagrams again", async () => {
    const drawn = [...view.dom.querySelectorAll(".mermaid-diagram-wrapper")];
    inCode(view, 1);
    view.dispatch(view.state.tr.insertText(" // more"));
    await settle();

    expect(render).toHaveBeenCalledTimes(2);
    expect([...view.dom.querySelectorAll(".mermaid-diagram-wrapper")]).toEqual(
      drawn
    );
  });

  test("editing a diagram draws this one only", async () => {
    const [, second] = view.dom.querySelectorAll(".mermaid-diagram-wrapper");
    inCode(view, 0);
    view.dispatch(view.state.tr.insertText(" B-->C;"));
    await settle();

    expect(render).toHaveBeenCalledTimes(3);
    const wrappers = view.dom.querySelectorAll(".mermaid-diagram-wrapper");
    expect(wrappers).toHaveLength(2);
    expect(wrappers[1]).toBe(second);
  });
});
