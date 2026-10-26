import { Node } from "prosemirror-model";
import { Plugin, PluginKey, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { refractor } from "refractor/core";

export const LANGUAGES = {
  none: "None", // additional entry to disable highlighting
  mermaid: "Mermaid",
  echarts: "Echarts",
  abcjs: "ABC Notation",
  bash: "Bash",
  css: "CSS",
  clike: "C",
  cpp: "C++",
  csharp: "C#",
  elixir: "Elixir",
  go: "Go",
  markup: "HTML",
  objectivec: "Objective-C",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  lua: "Lua",
  perl: "Perl",
  php: "PHP",
  powershell: "Powershell",
  python: "Python",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  yaml: "YAML",
};

/** The hast nodes refractor highlights a code block into */
type RefractorNode = ReturnType<typeof refractor.highlight>["children"][number];

/** A highlighted range, relative to the start of the code */
type Highlight = { from: number; to: number; className: string };

/** The highlighting of a code block, wherever it is in the doc */
type BlockHighlight = {
  highlights: Highlight[];
  lineNumbers?: { text: string; gutterWidth: number; lineCount: number };
};

/** Flatten the highlighted tree into the ranges of text with classes */
function collectHighlights(
  nodes: RefractorNode[],
  classNames: string[],
  out: Highlight[],
  offset: number
): number {
  for (const node of nodes) {
    if (node.type === "element") {
      const className = (node.properties.className || []) as string[];
      offset = collectHighlights(
        node.children,
        [...classNames, ...className],
        out,
        offset
      );
    } else if (node.type === "text") {
      const to = offset + node.value.length;
      if (classNames.length) {
        out.push({ from: offset, to, className: classNames.join(" ") });
      }
      offset = to;
    }
  }
  return offset;
}

function highlightBlock(
  node: Node,
  language: string,
  lineNumbers?: boolean
): BlockHighlight {
  const code = node.textContent;
  const highlights: Highlight[] = [];
  collectHighlights(
    refractor.highlight(code, language).children,
    [],
    highlights,
    0
  );

  if (!lineNumbers) {
    return { highlights };
  }
  const lineCount = (code.match(/\n/g) || []).length + 1;
  const gutterWidth = String(lineCount).length;
  const text = Array.from({ length: lineCount }, (_, i) =>
    `${i + 1}`.padStart(gutterWidth, " ")
  ).join(" \n");
  return { highlights, lineNumbers: { text, gutterWidth, lineCount } };
}

type DecorProps = {
  /** The prosemirror document */
  doc: Node;
  /** The node name. */
  name: string;
  /** Whether to include line numbers */
  lineNumbers?: boolean;
  /**
   * The highlighting of the code blocks by node: the nodes not changed by a
   * transaction are the same objects, wherever they moved to
   */
  cache: WeakMap<Node, BlockHighlight>;
};

export function getDecorations({ doc, name, lineNumbers, cache }: DecorProps) {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== name) {
      // no code blocks in inline content
      return !node.isTextblock;
    }
    const language = node.attrs.language;
    if (!language || language === "none" || !refractor.registered(language)) {
      return false;
    }

    let block = cache.get(node);
    if (!block) {
      block = highlightBlock(node, language, lineNumbers);
      cache.set(node, block);
    }

    const start = pos + 1;
    for (const { from, to, className } of block.highlights) {
      decorations.push(
        Decoration.inline(start + from, start + to, { class: className })
      );
    }
    if (block.lineNumbers) {
      const { text, gutterWidth, lineCount } = block.lineNumbers;
      decorations.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          {
            "data-line-numbers": `${text} `,
            style: `--line-number-gutter-width: ${gutterWidth};`,
          },
          { key: `line-${lineCount}-gutter` }
        )
      );
    }
    return false;
  });

  return DecorationSet.create(doc, decorations);
}

export default function Prism({
  name,
  lineNumbers,
}: {
  name: string;
  lineNumbers?: boolean;
}) {
  let highlighted = false;
  const cache = new WeakMap<Node, BlockHighlight>();

  return new Plugin({
    key: new PluginKey("prism"),
    state: {
      init: (_, { doc }) => DecorationSet.create(doc, []),
      apply: (transaction: Transaction, decorationSet, oldState, state) => {
        const nodeName = state.selection.$head.parent.type.name;
        const previousNodeName = oldState.selection.$head.parent.type.name;
        const codeBlockChanged =
          transaction.docChanged && [nodeName, previousNodeName].includes(name);
        const ySyncEdit = !!transaction.getMeta("y-sync$");

        if (!highlighted || codeBlockChanged || ySyncEdit) {
          highlighted = true;
          return getDecorations({
            doc: transaction.doc,
            name,
            lineNumbers,
            cache,
          });
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },
    view: (view) => {
      if (!highlighted) {
        // we don't highlight code blocks on the first render as part of mounting
        // as it's expensive (relative to the rest of the document). Instead let
        // it render un-highlighted and then trigger a defered render of Prism
        // by updating the plugins metadata
        setTimeout(() => {
          view.dispatch(view.state.tr.setMeta("prism", { loaded: true }));
        }, 10);
      }
      return {};
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
