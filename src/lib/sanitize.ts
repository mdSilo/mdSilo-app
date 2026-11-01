import DOMPurify, { type Config } from "dompurify";

/*
  HTML from outside, e.g. feed articles. Besides scripts and event handlers
  (removed by DOMPurify), nothing that can restyle, cover or pose as the app:
  no style sheets, inline styles, classes (e.g. `fixed inset-0`), ids or forms.
*/
const EXTERNAL_HTML: Config = {
  FORBID_TAGS: [
    "style",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
  ],
  FORBID_ATTR: ["style", "class", "id"],
};

// links open outside the app, without access to it
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Sanitize HTML from outside the app before rendering it. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, EXTERNAL_HTML);
}

/*
  A picture drawn by a plugin, e.g. a code block as SVG: shapes and their
  styles, ids for gradients and markers, but no scripts, no style sheets
  (they would restyle the app), no forms, no frames, nothing foreign.
*/
const PLUGIN_PICTURE: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  FORBID_TAGS: [
    "style",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "foreignObject",
    "iframe",
  ],
};

/** Sanitize the SVG or HTML drawn by a plugin; show it in a box that contains its layout (`contain: paint`). */
export function sanitizePluginPicture(html: string): string {
  return DOMPurify.sanitize(html, PLUGIN_PICTURE);
}
