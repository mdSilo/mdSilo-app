import { Node } from "prosemirror-model";
import textToSlug from "./textToSlug";

export type HashTag = {
  title: string;
  id: string;
};

/**
 * Iterates through the document to find all hashtags.
 *
 * @param doc Prosemirror document node
 * @returns Array<Hashtag>
 */
export function getHashtags(doc: Node) {
  const hashtags: HashTag[] = [];
  const previouslySeen = {};

  doc.forEach((node) => {
    node.forEach(child => {
      const hashs = child.marks.filter((m) => m.type.name === 'hashtag')
      if (hashs.length > 0) { 
        // calculate the optimal id
        const slug = textToSlug(child.textContent, 0, 't');
        let id = slug;

        // check if we've already used it, and if so how many times?
        // Make the new id based on that number ensuring that we have
        // unique ID's even when headings are identical
        if (previouslySeen[slug] > 0) {
          id = textToSlug(child.textContent, previouslySeen[slug], 't');
        }

        // record that we've seen this slug for the next loop
        previouslySeen[slug] =
          previouslySeen[slug] !== undefined ? previouslySeen[slug] + 1 : 1;

        hashtags.push({
          title: child.textContent,
          id,
        });
      }
    })
  });
  return hashtags;
}
