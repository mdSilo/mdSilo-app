import type { Renderers } from "mdsilo-publish";
import { renderSmiles } from "mdsmirror";
import { md5 } from "js-md5";
import { codeBlockPlugins, renderCode } from "@/plugins/codeBlocks";

/**
 * The diagrams of the site drawn here, where a browser is, as SVG: the site
 * loads no library. As the editor draws them (see mdsmirror's Diagram.ts),
 * in the light theme, charts without animation. The ids in a mermaid SVG
 * (its styles are scoped by them) of its code: the same in each build, the
 * ones kept from a build before (see renderCache.ts) not taken again.
 */

export const siteRenderers: Renderers = {
  mermaid: async (code) => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      suppressErrorRendering: true,
      fontFamily: "system-ui, sans-serif",
      theme: "default",
    });
    const id = `site-mermaid-${md5(code).slice(0, 12)}`;
    const { svg } = await mermaid.render(id, code);
    return svg;
  },
  echarts: async (code) => {
    const echarts = await import("echarts");
    const chart = echarts.init(null, null, {
      renderer: "svg",
      ssr: true,
      width: 720,
      height: 400,
    });
    try {
      chart.setOption(
        { animation: false, ...(JSON.parse(code) as object) },
        true,
      );
      return chart.renderToSVGString({ useViewBox: true });
    } finally {
      chart.dispose();
    }
  },
  smiles: (code) => renderSmiles(code),
};

/**
 * The code blocks the enabled plugins draw, in the light theme; with `dark`,
 * in the dark theme: the site shows them as the color scheme of the reader.
 */
export const pluginSiteRenderers = (dark = false): Renderers =>
  Object.fromEntries(
    [...codeBlockPlugins().keys()].map((lang) => [
      lang,
      (code: string) => renderCode(lang, code, dark),
    ]),
  );

/** The diagrams of the site, and the code blocks of the plugins; a plugin draws no built-in one */
export const allSiteRenderers = (): Renderers => ({
  ...pluginSiteRenderers(),
  ...siteRenderers,
});
