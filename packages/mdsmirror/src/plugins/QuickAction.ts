import { InputRule } from "prosemirror-inputrules";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import Extension from "../core/Extension";
import { Dispatch } from "../types";

/**
 * An editor extension that adds commands to insert the current date and time.
 */
export default class QuickAction extends Extension {
  get name() {
    return "quick_action";
  }

  inputRules() {
    return [
      // Note: There is a space at the end of the pattern here otherwise the
      // /datetime rule can never be matched.
      // these extra input patterns are needed until the block menu matches
      // in places other than the start of a line
      new InputRule(/\/date\s$/, ({ tr }, _match, start, end) => {
        tr.delete(start, end).insertText(getCurrentDateAsString() + " ");
        this.editor.handleCloseSlashMenu();
        return tr;
      }),
      new InputRule(/\/time\s$/, ({ tr }, _match, start, end) => {
        tr.delete(start, end).insertText(getCurrentTimeAsString() + " ");
        this.editor.handleCloseSlashMenu();
        return tr;
      }),
      new InputRule(/\/now\s$/, ({ tr }, _match, start, end) => {
        tr.delete(start, end).insertText(`${getCurrentDateTimeAsString()} `);
        this.editor.handleCloseSlashMenu();
        return tr;
      }),
    ];
  }

  commands(_options: { schema: Schema }) {
    return {
      date: () => (state: EditorState, dispatch: Dispatch) => {
        dispatch(state.tr.insertText(getCurrentDateAsString() + " "));
        return true;
      },
      time: () => (state: EditorState, dispatch: Dispatch) => {
        dispatch(state.tr.insertText(getCurrentTimeAsString() + " "));
        return true;
      },
      now: () => (state: EditorState, dispatch: Dispatch) => {
        dispatch(state.tr.insertText(getCurrentDateTimeAsString() + " "));
        return true;
      },
    };
  }
}

/**
 * Returns the current date as a string formatted depending on current locale.
 *
 * @returns The current date
 */
export function getCurrentDateAsString() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Returns the current time as a string formatted depending on current locale.
 *
 * @returns The current time
 */
export function getCurrentTimeAsString() {
  return new Date().toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "numeric",
  });
}

/**
 * Returns the current date and time as a string formatted depending on current
 * locale.
 *
 * @returns The current date and time
 */
export function getCurrentDateTimeAsString() {
  return new Date().toLocaleString(undefined, {
    weekday: 'long',
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}
