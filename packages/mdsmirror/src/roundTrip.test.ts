import { parser, schema, serializer } from "./server";

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

  test("keeps subscript and superscript", () => {
    for (const md of [
      "H~2~O and x^2^ + y^2^",
      "~~del~~ and C~n~",
      "AT&T and B&B",
    ]) {
      expect(roundTrip(md)).toBe(md);
    }
    const doc = parser.parse("H~2~O");
    expect(doc.firstChild?.child(1).marks[0].type.name).toBe("sub");
  });

  test("escapes a `~` only if it may be read as markup", () => {
    for (const md of [
      "~/a and ~/b",
      "cd ~/notes",
      "~5 min, a~b, a ~ b",
      "a ~/x\n~/y",
      // escaped by hand: kept
      "\\~/a and \\~/b",
      // may pair: escaped
      "a\\~b\\~c",
      "\\~\\~a\\~\\~",
      "a\\~ \\~\\~",
      "~/a **b**",
      "a\\~b **c** ~x",
    ]) {
      expect(roundTrip(md)).toBe(md);
    }
    // next to other inline content, a `~` may pair with one in it
    expect(roundTrip("a~**b**")).toBe("a\\~**b**");
    expect(roundTrip("**b**~a")).toBe("**b**\\~a");
    expect(roundTrip("a~ **b**")).toBe("a~ **b**");
  });

  test("reads typed `~` back as text", () => {
    const link = schema.marks.link.create({ href: "u" });
    const texts = ["a~b~c", "~~a~~", "x~y", "a~ ~~", "~/a and ~/b", "~", "~ ~"];
    const sides = [
      ["", ""],
      ["b", ""],
      ["", "b"],
      ["~", "~"],
      ["~~", "~"],
    ];
    for (const text of texts) {
      for (const [before, after] of sides) {
        const nodes = [
          before && schema.text(before, [link]),
          schema.text(text),
          after && schema.text(after, [link]),
        ].filter((n) => !!n);
        const doc = schema.node("doc", null, [
          schema.node("paragraph", null, nodes),
        ]);
        const back = parser.parse(serializer.serialize(doc));
        expect(back.textContent).toBe(doc.textContent);
        back.descendants((n) => {
          for (const m of n.marks) {
            expect(["link", "escape"]).toContain(m.type.name);
          }
        });
      }
    }
    // a `~` pairs with one in bold next to it: `a~**b~**` is subscript
    const bold = schema.marks.strong.create();
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("a~"),
        schema.text("b~", [bold]),
      ]),
    ]);
    const md = serializer.serialize(doc);
    expect(md).toBe("a\\~**b\\~**");
    expect(parser.parse(md).textContent).toBe("a~b~");
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

  // the label started with code: no text after `[ ]`, the parse threw
  test("a task starting with code or a link", () => {
    const md = "- [ ] `Enter` to add more\n- [x] [a link](https://a.b) done";
    const doc = parser.parse(md);
    expect(doc.firstChild?.type.name).toBe("checkbox_list");
    expect(doc.firstChild?.childCount).toBe(2);
    expect(doc.firstChild?.child(1).attrs.checked).toBe(true);
    expect(roundTrip(md)).toBe(md);
  });

  test("keeps the prefixes of nested blocks", () => {
    const md = [
      "> a",
      ">",
      "> > nested",
      "> >",
      "> > - item",
      "> >   more",
      ">",
      "> after",
    ].join("\n");
    expect(roundTrip(md)).toBe(md);
  });

  // the table used to be written out of its block, without the prefix
  test.each([
    ["a blockquote", "> para\n>\n> | a | b |\n> |---|---|\n> | 1 | 2 |"],
    ["a list item", "- item\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |\n- next"],
  ])("a table stays in %s", (_, md) => {
    const doc = parser.parse(md);
    const out = serializer.serialize(doc);
    expect(parser.parse(out).eq(doc)).toBe(true);
  });

  test("a table at the top level", () => {
    expect(roundTrip("text\n\n| a | b |\n|:--|--:|\n| 1 | 2 |")).toBe(
      "text\n\n| a | b |\n|:---|---:|\n| 1 | 2 |\n"
    );
  });
});
