import { Node as PmNode } from "prosemirror-model";

// strong right-to-left characters: Hebrew, Arabic, Syriac, Thaana, NKo...
const RTL = "\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC";
// strong left-to-right characters: Latin, Greek, Cyrillic, CJK...
const LTR =
  "A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF" +
  "\u200E\u2C00-\uFB1C\uFE00-\uFE6F\uFEFD-\uFFFF";

const STRONG = new RegExp(`[${LTR}${RTL}]`);
const STRONG_RTL = new RegExp(`[${RTL}]`);

/**
 * The direction of the first strong character of the document, which the
 * direction of `dir="auto"` follows; undefined if there is none.
 */
export function firstStrongDir(doc: PmNode): "rtl" | "ltr" | undefined {
  let dir: "rtl" | "ltr" | undefined;
  doc.descendants((node) => {
    if (dir) return false;
    if (node.isText) {
      const char = STRONG.exec(node.text || "")?.[0];
      if (char) {
        dir = STRONG_RTL.test(char) ? "rtl" : "ltr";
      }
    }
    return !dir;
  });
  return dir;
}
