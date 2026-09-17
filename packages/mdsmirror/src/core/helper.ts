import { Command, TextSelection, Transaction } from "prosemirror-state";
import { Node } from "prosemirror-model";

/**
 * Chain multiple commands into a single command and collects state as it goes.
 *
 * @param commands The commands to chain
 * @returns The chained command
 */
export function chainTransactions(
  ...commands: (Command | undefined)[]
): Command {
  return (state, dispatch): boolean => {
    const dispatcher = (tr: Transaction): void => {
      state = state.apply(tr);
      dispatch?.(tr);
    };
    const last = commands.pop();
    commands.map((command) => command?.(state, dispatcher));
    return last !== undefined && last(state, dispatch);
  };
}

/**
 * A prosemirror command to collapse the current selection to a cursor at the start of the selection.
 *
 * @returns A prosemirror command.
 */
export const collapseSelection = (): Command => (state, dispatch) => {
  dispatch?.(
    state.tr.setSelection(
      TextSelection.create(state.doc, state.tr.selection.from)
    )
  );
  return true;
};

export function combineClass(
  ...classNames: (string | number | Record<string, boolean> | undefined)[]
) {
  return classNames
    .filter(Boolean)
    .map((item) => {
      if (typeof item === "object") {
        return Object.entries(item)
          .filter(([, value]) => value)
          .map(([key]) => key)
          .join(" ");
      }
      return item;
    })
    .join(" ");
}

/**
 * Helper for iterating through the nodes in a document that changed
 * compared to the given previous document. Useful for avoiding
 * duplicate work on each transaction.
 */
export function changedDescendants(
  /** The previous node */
  old: Node,
  /** The current node */
  cur: Node,
  /** The offset of the current node */
  offset: number,
  /** The function to call for each changed node */
  callback: (node: Node, pos: number) => void
): void {
  const oldSize = old.childCount,
    curSize = cur.childCount;
  outer: for (let i = 0, j = 0; i < curSize; i++) {
    const child = cur.child(i);
    for (let scan = j, e = Math.min(oldSize, i + 3); scan < e; scan++) {
      if (old.child(scan) === child) {
        j = scan + 1;
        offset += child.nodeSize;
        continue outer;
      }
    }
    callback(child, offset);
    if (j < oldSize && old.child(j).sameMarkup(child)) {
      changedDescendants(old.child(j), child, offset + 1, callback);
    } else {
      child.nodesBetween(0, child.content.size, callback, offset + 1);
    }
    offset += child.nodeSize;
  }
}