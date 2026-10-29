import katex from 'katex';
// \ce{...} and \pu{...}: chemistry, as the editor
import 'katex/contrib/mhchem';
import { mathRules, renderToHtml } from 'mdsmirror';
import { escapeHtml, relHref } from './paths';

/** The tokens of markdown-it, as far as used here. */
type Token = {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  /** of a fence: its language */
  info: string;
  attrs: [string, string][] | null;
  children: Token[] | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
};
type MarkdownIt = {
  core: { ruler: { push(name: string, rule: (state: { tokens: Token[] }) => void): void } };
  renderer: { rules: Record<string, (tokens: Token[], idx: number) => string> };
};
type Plugin = NonNullable<Parameters<typeof renderToHtml>[1]>[number];

/** Where the links of a page go: a page of the site, or nowhere (private). */
export type Resolver = {
  /** a link of the page: the page it goes to, if published */
  link(href: string): string | undefined;
  /** an image: the file of the site it is, if it can be */
  image(src: string): string | undefined;
  /** a tag: its page, if any */
  tag(name: string): string | undefined;
};

export type Rendered = {
  html: string;
  /** the pages linked */
  links: Set<string>;
  tags: Set<string>;
  /** the code blocks to draw, marked in the html by `diagramMark` */
  diagrams: Diagram[];
};

export type Diagram = { id: number; lang: string; code: string };

/** What to draw of a note, beyond the text. */
export type Features = {
  math: boolean;
  /** the languages of the code blocks drawn, e.g. mermaid */
  diagrams: Set<string>;
  /** a new id of a diagram, unique in the site */
  nextId: () => number;
};

export const NO_FEATURES: Features = { math: false, diagrams: new Set(), nextId: () => 0 };

/** Where a diagram goes in the html: a comment, never from a note (escaped). */
export const diagramMark = (id: number) => `<!--mdsilo-diagram-${id}-->`;

/** Math as MathML: drawn by browsers, no font nor style to ship. */
export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: false });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

const EXTERNAL = /^(https?:|mailto:)/i;

/** Remove the front matter (`---` ... `---` at the start). */
export function stripFrontMatter(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(content);
  return match ? content.slice(match[0].length) : content;
}

/** The fields of the front matter, `key: value` lines. */
export function frontMatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(content);
  const fields: Record<string, string> = {};
  for (const line of match?.[1].split(/\r?\n/) ?? []) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

/** A token made plain text: an unpublished link keeps its text only. */
const blank = (token: Token) => {
  token.type = 'text';
  token.tag = '';
  token.nesting = 0;
  token.content = '';
  token.attrs = null;
};

function rewrite(tokens: Token[], page: string, resolver: Resolver, out: Rendered, features: Features) {
  // the link_close of each link_open: blanked with it, or not
  const opened: boolean[] = [];
  let tag: { open: Token; name: string } | undefined;
  for (const token of tokens) {
    if (token.children) rewrite(token.children, page, resolver, out, features);
    if (tag && token.type === 'text') tag.name += token.content;
    switch (token.type) {
      case 'link_open': {
        const href = token.attrGet('href') ?? '';
        if (EXTERNAL.test(href) || href.startsWith('#')) {
          opened.push(true);
          break;
        }
        const target = resolver.link(href);
        if (target) {
          out.links.add(target);
          token.attrSet('href', relHref(page, target));
          opened.push(true);
        } else {
          blank(token);
          opened.push(false);
        }
        break;
      }
      case 'link_close':
        if (opened.pop() === false) blank(token);
        break;
      case 'image': {
        const src = token.attrGet('src') ?? '';
        if (EXTERNAL.test(src)) break;
        const target = resolver.image(src);
        if (target) token.attrSet('src', relHref(page, target));
        else blank(token);
        break;
      }
      // `<!-- -->`: notes keep data in them (e.g. annotations), never published
      case 'comment':
      case 'comment_inline':
        blank(token);
        break;
      case 'fence': {
        const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        if (!features.diagrams.has(lang)) break;
        const id = features.nextId();
        out.diagrams.push({ id, lang, code: token.content });
        Object.assign(token, { type: 'html_block', content: `${diagramMark(id)}\n` });
        break;
      }
      case 'hashtag_open':
        tag = { open: token, name: '' };
        break;
      case 'hashtag_close': {
        const name = tag?.name.trim() ?? '';
        const target = name ? resolver.tag(name) : undefined;
        if (name) out.tags.add(name);
        if (tag && target) {
          Object.assign(tag.open, { type: 'link_open', tag: 'a', attrs: null });
          tag.open.attrSet('href', relHref(page, target));
          tag.open.attrSet('class', 'tag');
          Object.assign(token, { type: 'link_close', tag: 'a' });
        }
        tag = undefined;
        break;
      }
    }
  }
}

/** The HTML of a note on `page`, its links resolved. */
export function renderNote(content: string, page: string, resolver: Resolver, features = NO_FEATURES): Rendered {
  const out: Rendered = { html: '', links: new Set(), tags: new Set(), diagrams: [] };
  const plugin = (md: MarkdownIt) => {
    md.core.ruler.push('mdsilo_publish', (state) => rewrite(state.tokens, page, resolver, out, features));
    const inline = (tokens: Token[], idx: number) => renderMath(tokens[idx].content, false);
    const display = (tokens: Token[], idx: number) => renderMath(tokens[idx].content, true);
    Object.assign(md.renderer.rules, { math_inline: inline, math_display: display, math: display });
  };
  const markdown = stripFrontMatter(content);
  const math = features.math ? mathRules : [];
  out.html = renderToHtml(markdown, [...math, plugin as unknown as Plugin]);
  return out;
}

/** Plain text of HTML, for the search. */
export const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e] as string)
    .replace(/\s+/g, ' ')
    .trim();
