import MarkdownIt from "markdown-it";

export default function wikiLinkRule(md: MarkdownIt) {
  const opts = {
    baseUrl: '',
    relativeBaseURL: '',
    uriSuffix: '',
  };

  // Recognize Mediawiki links ([[wiki text]])
  md.linkify.add("[[", {
    validate: /^([^[|\]\n]+)(\|([^[|\]\n]+))?\]\]/u,
    normalize: (match) => {
      const parts = match.raw.slice(2, -2).split("|");
      match.text = (parts[1] || parts[0]).trim();
      match.url = opts.baseUrl + parts[0].trim(); //.replace(/\s/g, "_");
    },
  });
};
