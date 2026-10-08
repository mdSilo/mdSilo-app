import { parser, serializer, renderToHtml } from "./server";

const roundTrip = (md: string) => serializer.serialize(parser.parse(md));

describe("comment", () => {
  test("a comment on its own lines is a comment block", () => {
    const doc = parser.parse("a\n\n<!-- Your comment goes here -->\n\nb");
    expect(doc.child(1).type.name).toBe("comment");
    expect(doc.child(1).textContent).toBe(" Your comment goes here ");

    const multi = parser.parse("<!--\nline 1\n  line 2\n-->");
    expect(multi.child(0).type.name).toBe("comment");
    expect(multi.child(0).textContent).toBe("\nline 1\n  line 2\n");
  });

  test("a comment in a paragraph is an inline comment", () => {
    const doc = parser.parse("text <!-- a *note* --> more");
    const para = doc.child(0);
    expect(para.type.name).toBe("paragraph");
    const comment = para.child(1);
    expect(comment.text).toBe(" a *note* ");
    expect(comment.marks.map((m) => m.type.name)).toEqual(["comment_inline"]);
  });

  test("the comments are kept as is on save", () => {
    for (const md of [
      "<!-- Your comment goes here -->",
      "# title\n\n<!-- one -->\n\ntext",
      "<!--\nmulti *line*\n  [comment](x) \\@ref\n-->",
      "text <!-- a *note* [x](y) --> more",
      "text <!-- multi\nline --> more",
      "- item\n\n  <!-- in a list -->",
      "> <!--\n> quoted\n> -->",
      "`<!-- code -->`",
    ]) {
      expect(roundTrip(md)).toBe(md);
    }
  });

  test("not a comment", () => {
    // not closed
    expect(roundTrip("<!-- open")).toBe("<!-- open");
    expect(parser.parse("<!-- open").child(0).type.name).toBe("paragraph");
    // text after the comment
    const doc = parser.parse("<!-- a --> b");
    expect(doc.child(0).type.name).toBe("paragraph");
    expect(roundTrip("<!-- a --> b")).toBe("<!-- a --> b");
    // indented code
    expect(parser.parse("    <!-- a -->").child(0).type.name).toBe(
      "code_block"
    );
  });

  test("the comments are not shown in html", () => {
    expect(renderToHtml("a <!-- b --> c\n\n<!--\nd\n-->")).toBe(
      "<p>a <!-- b --> c</p>\n<!--\nd\n-->"
    );
  });
});
