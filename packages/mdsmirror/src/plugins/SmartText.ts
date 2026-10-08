import { ellipsis, smartQuotes, InputRule } from "prosemirror-inputrules";
import Extension from "../core/Extension";

// not `-->`, which closes a comment `<!-- -->`
const rightArrow = new InputRule(/(?:^|[^-])(->)$/, "→");

export default class SmartText extends Extension {
  get name() {
    return "smart_text";
  }

  inputRules() {
    return [rightArrow, ellipsis, ...smartQuotes];
  }
}
