import type { MarkdownIt } from "markdown-it";

export default function itemLinkRule(md: MarkdownIt) {
  // Recognize item links ({{wiki text}})
  md.linkify.add("{{", {
    // the length of the link after "{{", 0 if none
    validate: (text, pos) =>
      /^[^{}\n]+\}\}/u.exec(text.slice(pos))?.[0].length ?? 0,
    normalize: (match) => {
      const raw = match.raw.slice(2, -2);
      const parts = raw.split("|");
      match.text = raw.trim();
      match.url = `${parts[0].trim()}@item`; // magic suffix
    },
  });
}
