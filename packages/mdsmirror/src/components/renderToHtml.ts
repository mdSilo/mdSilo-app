import { PluginSimple } from "markdown-it";
import createMarkdown from "../core/rules/markdown";
import breakRule from "../core/rules/breaks";
import checkboxRule from "../core/rules/checkboxes";
import embedsRule from "../core/rules/embedsRule";
import markRule from "../core/rules/mark";
import noticesRule from "../core/rules/notices";
import tablesRule from "../core/rules/tables";
import underlinesRule from "../core/rules/underlines";
import mathRule from "../core/rules/math";
import mathTexRule from "../core/rules/math_katex";
import attachmentRule from "../core/rules/attachment";
import itemcardRule from "../core/rules/itemcard";
import itemLinkRule from "../core/rules/itemlink";
import wikiLinkRule from "../core/rules/wikilink";

const defaultRules = [
  embedsRule([]),
  breakRule,
  checkboxRule,
  markRule({ delim: "==", mark: "highlight" }),
  markRule({ delim: "!!", mark: "placeholder" }),
  markRule({ delim: "#", mark: "hashtag" }),
  markRule({ delim: "&", mark: "sub" }),
  markRule({ delim: "^", mark: "sup" }),
  underlinesRule,
  tablesRule,
  noticesRule,
  mathRule,
  mathTexRule(undefined),
  wikiLinkRule, 
  attachmentRule,
  itemcardRule, 
  itemLinkRule,
];

export default function renderToHtml(
  markdown: string,
  rulePlugins: PluginSimple[] = defaultRules
): string {
  return createMarkdown({ plugins: rulePlugins }).render(markdown).trim();
}
