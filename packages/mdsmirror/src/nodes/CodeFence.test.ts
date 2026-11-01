import CodeFence from "./CodeFence";

describe("CodeFence", () => {
  test("adds the languages drawn by the renderers given", () => {
    const render = async () => "<svg/>";
    const fence = new CodeFence({
      dark: false,
      codeRenderers: { plantuml: render, mermaid: render },
    });
    expect(fence.renderedLanguages).toEqual(["plantuml"]);
    expect(fence.diagramLanguages).toContain("plantuml");
    expect(fence.languageOptions).toContainEqual(["plantuml", "plantuml"]);
    // a diagram per language: the built-in ones, then the one given
    expect(fence.plugins).toHaveLength(1 + 4 + 1);
  });

  test("draws only the built-in diagrams by default", () => {
    const fence = new CodeFence({ dark: false });
    expect(fence.renderedLanguages).toEqual([]);
    expect(fence.plugins).toHaveLength(1 + 4);
  });
});
