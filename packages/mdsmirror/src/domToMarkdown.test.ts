import { describe, expect, test } from "vitest";
import { domToMarkdown } from "./server";

const body = (html: string) =>
  new DOMParser().parseFromString(html, "text/html").body;

describe("domToMarkdown", () => {
  test("converts plain HTML, e.g. pasted or imported", () => {
    const md = domToMarkdown(
      body(
        "<h1>Title</h1><h3>Sub</h3><p>a <strong>b</strong> <a href='https://x.y'>c</a></p>" +
          "<blockquote><p>q</p></blockquote><ol><li>one</li></ol>"
      )
    );
    expect(md).toContain("# Title");
    expect(md).toContain("### Sub");
    expect(md).toContain("a **b** [c](https://x.y)");
    expect(md).toContain("> q");
    expect(md).toContain("1. one");
  });

  test("converts the editor's own heading markup", () => {
    const md = domToMarkdown(
      body('<h2><span class="heading-content">Own</span></h2>')
    );
    expect(md.trim()).toBe("## Own");
  });
});
