import { escape } from "lodash";
import { Node } from "prosemirror-model";
import slugify from "slugify";

// Slugify, escape, and remove periods from headings so that they are
// compatible with both url hashes AND dom ID's (querySelector does not like
// ID's that begin with a number or a period, for example).
function safeSlugify(text: string, prefix: string) {
  return `${prefix}-${escape(
    slugify(text, {
      remove: /[!"#$%&'\.()*+,\/:;<=>?@\[\]\\^_`{|}~]/g,
      lower: true,
    })
  )}`;
}

// calculates a unique slug for this heading based on it's text and position
// in the document that is as stable as possible
export default function textToSlug(text: string, index = 0, prefix = 'h') {
  const slugified = safeSlugify(text, prefix);
  if (index === 0) {
    return slugified;
  }
  return `${slugified}-${index}`;
}
