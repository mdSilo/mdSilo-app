import { parser, serializer } from "./server";

const roundTrip = (md: string) => serializer.serialize(parser.parse(md));

describe("markdown round trip", () => {
  // https://github.com/mdSilo/mdSilo-app/issues/781
  test("keeps a correct file as is", () => {
    const md = [
      "# Simple Markdown document",
      "",
      "Ordered list is below:",
      "",
      "1. One",
      "1. Two",
      "1. Three",
      "",
      "Unordered list is below:",
      "",
      "* red;",
      "* green;",
      "* orange.",
      "",
      "Bash script is below:",
      "",
      "```bash",
      "date",
      "```",
      "",
      "Two links in the list:",
      "",
      "1. [`mdl`](https://rubygems.org/gems/mdl)",
      "1. [`remark`](https://github.com/remarkjs/remark)",
      "",
      "Two links in the text - [`mdl`](https://rubygems.org/gems/mdl), [remark](https://github.com/remarkjs/remark).",
      "",
      "Third link - [file from `r4ds-exercise-solutions`](https://github.com/jrnold/r4ds-exercise-solutions/blob/master/.remarkrc).",
      "",
      "Footnote is here [^fn1]",
      "",
      "[^fn1]: the footnote text.",
      "",
      "Some LaTeX text placed here intentionally for bookdown and xaringan:",
      "\\@ref(eq:do-no-touch-me), \\eqref{binom_eq} and \\@ref(exm:listing2-name).",
      "",
      "Some text.",
    ].join("\n");
    expect(roundTrip(md)).toBe(md);
  });

  test("lists keep their markers and numbers", () => {
    for (const md of [
      "- a\n- b",
      "+ a\n+ b",
      "1. a\n2. b\n3. c",
      "3. a\n4. b",
      "3. a\n3. b",
      "text\n\n1. a\n2. b\n\nmore",
    ]) {
      expect(roundTrip(md)).toBe(md);
    }
  });

  test("keeps the escapes", () => {
    for (const md of [
      "\\@ref and \\$5 and \\#tag",
      "a \\* b \\_c\\_ \\[x\\](y)",
      "a\\\\b and C:\\\\path\\\\ end \\\\",
      "**\\@bold** and [\\@link](url)",
      "1\\. not a list",
      "snake\\_case and snake_case",
      "- a\n  \\# b\n  \\@c",
      "> a\n> \\- b",
    ]) {
      expect(roundTrip(md)).toBe(md);
    }
  });

  test("escapes what is needed only", () => {
    expect(roundTrip("\\eqref and \\e and C:\\x")).toBe(
      "\\eqref and \\e and C:\\x"
    );
    // a footnote is not escaped, unless it could be a link
    expect(roundTrip("a [^1] b [^1]: c")).toBe("a [^1] b [^1]: c");
    expect(roundTrip("[^1]: the note text")).toBe("[^1]: the note text");
    expect(roundTrip("\\[^a\\](b) and \\[^a\\]\\[b\\]")).toBe(
      "\\[^a\\](b) and \\[^a\\]\\[b\\]"
    );
    expect(roundTrip("\\[^a\\]: /x")).toBe("\\[^a\\]: /x");
    expect(roundTrip('\\[^a\\]: /x "title"')).toBe('\\[^a\\]: /x "title"');
  });

  test("keeps the line breaks of a paragraph", () => {
    const md = "line one\nline two\n\n- item\n  next line";
    expect(roundTrip(md)).toBe(md);
  });
});
