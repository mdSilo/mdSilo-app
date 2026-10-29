import type { Renderers } from 'mdsilo-publish';

/**
 * The diagrams of the site drawn here, where a browser is, as SVG: the site
 * loads no library. As the editor draws them (see mdsmirror's Diagram.ts),
 * in the light theme, charts without animation.
 */
let seq = 0;

export const siteRenderers: Renderers = {
  mermaid: async (code) => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      suppressErrorRendering: true,
      fontFamily: 'system-ui, sans-serif',
      theme: 'default',
    });
    const { svg } = await mermaid.render(`site-mermaid-${(seq += 1)}`, code);
    return svg;
  },
  echarts: async (code) => {
    const echarts = await import('echarts');
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 720, height: 400 });
    try {
      chart.setOption({ animation: false, ...(JSON.parse(code) as object) }, true);
      return chart.renderToSVGString({ useViewBox: true });
    } finally {
      chart.dispose();
    }
  },
};
