import hljs from 'highlight.js/lib/common';

/**
 * The code blocks of a book, highlighted by highlight.js (ported from readup:
 * utils/highlightjs.ts). The colors are in `codeStyles`, of the page theme.
 */

export const CODE_LANGUAGES = [
  'auto', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql', 'ini', 'java', 'javascript', 'json',
  'kotlin', 'less', 'lua', 'makefile', 'markdown', 'objectivec', 'perl', 'php', 'python', 'r', 'ruby', 'rust',
  'scss', 'shell', 'sql', 'swift', 'typescript', 'vbnet', 'xml', 'yaml',
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

hljs.configure({ ignoreUnescapedHTML: true });

/** The blocks as the book has them, to put back when highlighting is off. */
const originals = new WeakMap<Element, string>();

/** The block to highlight: the <code> in a <pre>, or the <pre>. */
const blocksOf = (doc: Document) =>
  Array.from(doc.querySelectorAll('pre')).map((pre) => (pre.children.length === 1 && pre.firstElementChild?.localName === 'code' ? pre.firstElementChild : pre));

/** Highlight the code of a section, in a language or guessed; or put it back as it was. */
export function highlightCode(doc: Document, on: boolean, language: CodeLanguage = 'auto') {
  for (const block of blocksOf(doc)) {
    const original = originals.get(block);
    if (original !== undefined) {
      block.innerHTML = original;
      block.classList.remove('hljs');
      block.removeAttribute('data-highlighted');
      if (!on) originals.delete(block);
    }
    if (!on) continue;
    if (original === undefined) originals.set(block, block.innerHTML);
    const lang = language !== 'auto' && hljs.getLanguage(language) ? language : undefined;
    const code = block.textContent ?? '';
    const result = lang ? hljs.highlight(code, { language: lang }) : hljs.highlightAuto(code);
    block.innerHTML = result.value;
    block.classList.add('hljs');
    block.setAttribute('data-highlighted', 'yes');
  }
}

/** The colors of the code, GitHub light or dark, as the page. */
export function codeStyles(dark: boolean): string {
  return dark
    ? `.hljs{color:#c9d1d9}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}.hljs-built_in,.hljs-symbol{color:#ffa657}.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}.hljs-subst{color:#c9d1d9}.hljs-section{color:#1f6feb;font-weight:700}.hljs-bullet{color:#f2cc60}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-addition{color:#aff5b4;background-color:#033a16}.hljs-deletion{color:#ffdcd7;background-color:#67060c}`
    : `.hljs{color:#24292e}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#d73a49}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}.hljs-built_in,.hljs-symbol{color:#e36209}.hljs-code,.hljs-comment,.hljs-formula{color:#6a737d}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#22863a}.hljs-subst{color:#24292e}.hljs-section{color:#005cc5;font-weight:700}.hljs-bullet{color:#735c0f}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}.hljs-addition{color:#22863a;background-color:#f0fff4}.hljs-deletion{color:#b31d28;background-color:#ffeef0}`;
}
