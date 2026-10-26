import markdownit from "markdown-it";
import type { PluginSimple } from "../../types";

export default function rules({
  rules = {},
  plugins = [],
}: {
  rules?: Record<string, any>;
  plugins?: PluginSimple[];
}) {
  const markdownIt = markdownit("default", {
    breaks: false,
    html: false,
    linkify: true,
    ...rules,
  });
  // linkify rule `[[` or others not work on Tauri webview
  // try: https://github.com/markdown-it/markdown-it/issues/612#issuecomment-806288841
  markdownIt.enable(["linkify"]);
  // linkify-it 6 no longer links bare domains (example.com) by default
  markdownIt.linkify.set({ fuzzyLink: true });
  plugins.forEach((plugin) => markdownIt.use(plugin));
  return markdownIt;
}
