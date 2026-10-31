import type SmilesDrawer from "smiles-drawer";

// loaded on the first drawing, once
let smilesModule: Promise<typeof import("smiles-drawer")> | undefined;
const loadSmiles = () => (smilesModule ??= import("smiles-drawer"));

const SVG_NS = "http://www.w3.org/2000/svg";
// the drawings in the page so far, for ids of their own
let drawn = 0;

/**
 * The drawings of SMILES code, one per line: a molecule, or a reaction
 * (`reactants>agents>products`), as SVG. Each line can end with
 * the settings of smiles-drawer, e.g. `CCO __{"textBelowArrow": "heat"}__`.
 * Rejects with the error of the first line not drawn.
 */
export async function renderSmiles(
  code: string,
  dark = false
): Promise<string> {
  const lines = code
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  const { default: Smiles } = await loadSmiles();
  // at their own size (scale), not in a box of the default 500x500
  const drawer = new Smiles.SmiDrawer({ scale: 1 }, { scale: 1 });
  return lines.map((line) => drawLine(drawer, line, dark)).join("");
}

function drawLine(
  drawer: InstanceType<typeof SmilesDrawer.SmiDrawer>,
  line: string,
  dark: boolean
): string {
  const svg = document.createElementNS(SVG_NS, "svg");
  let error: unknown;
  // synchronous: the callbacks are called before it returns
  drawer.draw(line, svg, dark ? "dark" : "light", null, (e: unknown) => {
    error = e;
  });
  if (error) throw error instanceof Error ? error : new Error(String(error));

  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", line);
  svg.classList.add("smiles-drawing");
  // its styles are of the whole page: keep them to the drawing
  svg.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent ?? "").replace(
      /(^|\})(\s*)\.([\w-]+)/g,
      "$1$2.smiles-drawing .$3"
    );
  });
  uniqueIds(svg, `smiles-${(drawn += 1)}`);
  return svg.outerHTML;
}

/**
 * Some ids are always the same (e.g. `arrowhead` of reactions): of another
 * drawing, a reaction draws with the arrow of the first one in the page.
 */
function uniqueIds(svg: Element, prefix: string) {
  const ids = new Set<string>();
  svg.querySelectorAll("[id]").forEach((el) => {
    ids.add(el.id);
    el.id = `${prefix}-${el.id}`;
  });
  if (!ids.size) return;
  const ref = /url\(#([^)]+)\)|^#(.+)$/g;
  svg.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const value = attr.value.replace(ref, (match, url, href) =>
        ids.has(url ?? href)
          ? url
            ? `url(#${prefix}-${url})`
            : `#${prefix}-${href}`
          : match
      );
      if (value !== attr.value) el.setAttribute(attr.name, value);
    }
  });
}
