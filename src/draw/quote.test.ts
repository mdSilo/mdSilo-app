import { quoteOfMarkdown } from "./quote";

describe("quoteOfMarkdown", () => {
  it("the text of the quote, the source linked", () => {
    expect(
      quoteOfMarkdown(
        "> Down the rabbit hole\n> she went\n>\n> — [Alice](book:abc#epubcfi(/6/4!/4/2))",
      ),
    ).toEqual({
      text: "Down the rabbit hole\nshe went\n\n— Alice",
      link: "book:abc#epubcfi(/6/4!/4/2)",
    });
  });

  it("a quote of no book: the text only", () => {
    expect(quoteOfMarkdown("> just this")).toEqual({ text: "just this" });
  });
});
