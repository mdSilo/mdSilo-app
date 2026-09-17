import { Plugin } from "prosemirror-state";
import { InputRule } from "prosemirror-inputrules";
import Extension from "../core/Extension";

const OPEN_REGEX = /^(.*)?\{\{$/;

export default class SearchRemoteTrigger extends Extension {
  get name() {
    return "search_remote";
  }

  get plugins() {
    return [
      new Plugin({
        props: {},
      }),
    ];
  }

  inputRules() {
    return [
      new InputRule(OPEN_REGEX, (state, match) => {
        if (match) {
          this.options.onOpen(match[1] || "");
        }
        return null;
      }),
    ];
  }
}
