import { renderSmiles } from "./smiles";

const svgsOf = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return [...div.querySelectorAll(":scope > svg")];
};

describe("renderSmiles", () => {
  test("a drawing per line, at its own size", async () => {
    const svgs = svgsOf(await renderSmiles("CCO\n\n  c1ccccc1  \n"));
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute("aria-label")).toBe("CCO");
    expect(svgs[1].getAttribute("aria-label")).toBe("c1ccccc1");
    for (const svg of svgs) {
      expect(svg.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
      expect(svg.getAttribute("viewBox")).toBeTruthy();
    }
  });

  test("a reaction", async () => {
    const [svg] = svgsOf(await renderSmiles("CC=C.[H][H]>>CCC"));
    expect(svg.querySelectorAll("svg").length).toBeGreaterThan(1);
  });

  test("ids of its own: two reactions, two arrows", async () => {
    const svgs = svgsOf(await renderSmiles("CC=C>>CCC\nCC=C>>CCC"));
    const arrows = svgs.map((svg) => svg.querySelector("marker")?.id);
    expect(arrows[0]).toMatch(/^smiles-\d+-arrowhead$/);
    expect(arrows[1]).not.toBe(arrows[0]);
    const line = svgs[1].querySelector("[marker-end]");
    expect(line?.getAttribute("marker-end")).toBe(`url(#${arrows[1]})`);
  });

  test("its styles kept to the drawing", async () => {
    const [svg] = svgsOf(await renderSmiles("CCO"));
    const css = svg.querySelector("style")?.textContent ?? "";
    expect(css).toContain(".smiles-drawing .element {");
    expect(css).toContain(".smiles-drawing .sub {");
    expect(css).not.toMatch(/(^|\})\s*\.element/);
  });

  test("nothing to draw; an error for a wrong line", async () => {
    expect(await renderSmiles(" \n")).toBe("");
    await expect(renderSmiles("CCO\nC1CC(")).rejects.toThrow(/parentheses/);
  });
});
