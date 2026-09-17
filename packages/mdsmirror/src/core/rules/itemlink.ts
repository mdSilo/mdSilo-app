import MarkdownIt from "markdown-it";

export default function itemLinkRule(md: MarkdownIt) {
  // Recognize item links ({{wiki text}})
  md.linkify.add("{{", {
    validate: /^([^{\}\n]+)\}\}/u,
    normalize: (match) => {
      const raw = match.raw.slice(2, -2)
      const parts = raw.split("|");
      match.text = raw.trim();
      match.url = `${parts[0].trim()}@item`; // magic suffix
    },
  });
};
