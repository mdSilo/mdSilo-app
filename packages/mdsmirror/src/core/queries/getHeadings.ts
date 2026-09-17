import { Node } from "prosemirror-model";
import textToSlug from "./textToSlug";

export type Heading = {
  title: string;
  level: number;
  id: string;
};

/**
 * Iterates through the document to find all of the headings and their level.
 *
 * @param doc Prosemirror document node
 * @returns Array<Heading>
 */
export function getHeadings(doc: Node) {
  const headings: Heading[] = [];
  const previouslySeen = {};

  doc.forEach((node) => {
    if (node.type.name === "heading") {
      // calculate the optimal slug
      const slug = textToSlug(node.textContent);
      let id = slug;

      // check if we've already used it, and if so how many times?
      // Make the new id based on that number ensuring that we have
      // unique ID's even when headings are identical
      if (previouslySeen[slug] > 0) {
        id = textToSlug(node.textContent, previouslySeen[slug]);
      }

      // record that we've seen this slug for the next loop
      previouslySeen[slug] =
        previouslySeen[slug] !== undefined ? previouslySeen[slug] + 1 : 1;

      headings.push({
        title: node.textContent,
        level: node.attrs.level,
        id,
      });
    }
  });
  return headings;
}
