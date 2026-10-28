import { parser, serializer } from "./server";
import { escapeHref } from "./marks/Link";

const links = (md: string) => {
  const inline = parser.tokenizer
    .parse(md, {})
    .find((t) => t.type === "inline");
  const out: Array<[string | null, string]> = [];
  const children = inline?.children ?? [];
  children.forEach((t, i) => {
    if (t.type === "link_open") {
      // the text of the link, escaped chars are tokens of their own
      let text = "";
      for (let j = i + 1; j < children.length; j++) {
        if (children[j].type === "link_close") break;
        text += children[j].content;
      }
      out.push([t.attrGet("href"), text]);
    }
  });
  return out;
};

describe("wiki link", () => {
  test("titles looking like emphasis are links", () => {
    expect(links("see [[_draft_]] and [[__init__]] ok")).toEqual([
      ["_draft_", "_draft_"],
      ["__init__", "__init__"],
    ]);
    expect(links("[[a *b* c]]")).toEqual([["a%20*b*%20c", "a *b* c"]]);
  });

  test("alias, escapes and several links in a line", () => {
    expect(links("[[ my note | alias]] [[a\\*b]] [[x]]")).toEqual([
      ["my%20note", "alias"],
      ["a*b", "a*b"],
      ["x", "x"],
    ]);
  });

  test("escaped or in code is not a link", () => {
    expect(links("\\[[x]] `[[y]]`")).toEqual([]);
  });

  test("survives a round trip", () => {
    for (const title of ["_draft_", "__init__", "a_b", "x*y*"]) {
      const md = serializer.serialize(parser.parse(`see [[${title}]] ok`));
      expect(links(md)).toEqual([[title, title]]);
    }
  });
});

describe("escapeHref", () => {
  test("keeps the href as is when safe", () => {
    expect(escapeHref("_draft_")).toBe("_draft_");
    expect(escapeHref("a*b")).toBe("a*b");
    expect(escapeHref("https://x.org/Foo_(bar)")).toBe(
      "https://x.org/Foo_(bar)"
    );
  });

  test("encodes or escapes what breaks a destination", () => {
    expect(escapeHref("my note")).toBe("my%20note");
    expect(escapeHref("a)b")).toBe("a\\)b");
    expect(escapeHref("a\\b")).toBe("a\\\\b");
  });

  test("link survives a round trip", () => {
    for (const href of ["a)b", "a\\b", "x*y_", "my%20note"]) {
      const md = serializer.serialize(parser.parse(`[t](${escapeHref(href)})`));
      expect(links(md).map(([h, t]) => [decodeURI(h || ""), t])).toEqual([
        [decodeURI(href), "t"],
      ]);
    }
  });
});

describe("item link", () => {
  test("a book by its title, with an alias", () => {
    expect(links("read {{Dune}} and {{ Dune Messiah | the 2nd }} ok")).toEqual([
      ["book:Dune", "Dune"],
      ["book:Dune%20Messiah", "the 2nd"],
    ]);
  });

  test("escaped, in code or not closed is not a link", () => {
    expect(links("\\{{x}} `{{y}}` {{z} {{}}")).toEqual([]);
  });

  test("a round trip keeps the link to the book", () => {
    const md = serializer.serialize(parser.parse("see {{The _Book_}} ok"));
    expect(links(md)).toEqual([["book:The%20_Book_", "The _Book_"]]);
  });
});
