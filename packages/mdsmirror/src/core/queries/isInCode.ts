import { EditorState } from "prosemirror-state";
import { isMarkActive } from "./isMarkActive";

export default function isInCode(state: EditorState): boolean {
  // a comment is edited like code: its text is kept as is
  const { code_block, comment } = state.schema.nodes;
  if (code_block || comment) {
    const $head = state.selection.$head;
    for (let d = $head.depth; d > 0; d--) {
      const type = $head.node(d).type;
      if (
        (code_block && type === code_block) ||
        (comment && type === comment)
      ) {
        return true;
      }
    }
  }

  return isMarkActive(state.schema.marks.code_inline)(state);
}
