#!/usr/bin/env node
// i18n tooling, see src/i18n/index.ts
//
//   node scripts/i18n.mjs find [path...]   list UI text not wrapped in t() yet
//   node scripts/i18n.mjs sync [--check]   collect the keys of t()/tn()/tk()/tr() and
//                                          update src/i18n/locales/*.json
//
// `find` looks at JSX text, the UI attributes of JSX (title, placeholder,
// aria-label, label...) and the messages of alert()/ask()/confirm()...; a line
// with `i18n-ignore`, or below a line with it, is skipped.
// `sync` adds the new keys with "" (shown in English until translated), drops
// the keys no longer used, and reports what is left to translate; with
// --check it fails if a locale misses a key or has one untranslated.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const LOCALES = path.join(SRC, "i18n", "locales");

/** functions whose string arguments are keys */
const KEY_FUNCS = new Set(["t", "tk", "tn", "tr"]);
/** JSX attributes shown to the user */
const UI_ATTRS = new Set([
  "title",
  "placeholder",
  "aria-label",
  "alt",
  "label",
  "action",
  "message",
  "confirmLabel",
  "submitLabel",
  "cancelLabel",
  "tooltip",
  "emptyText",
  "description",
  "heading",
  "text",
  "hint",
  // of the components of the app
  "content",
  "tooltipContent",
  "ariaLabel",
  "submitText",
  "prevTitle",
  "nextTitle",
  "initialTitle",
]);
/** properties of objects shown to the user: a menu item, a tab, a dialog */
const UI_PROPS = new Set([
  "label",
  "title",
  "text",
  "tooltip",
  "placeholder",
  "message",
  "description",
]);
/** functions whose string arguments are shown to the user */
const UI_CALLS = new Set([
  "alert",
  "confirm",
  "ask",
  "message",
  "messageBox",
  "prompt",
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(full, out);
    } else if (
      /\.(tsx?|jsx?)$/.test(e.name) &&
      !/\.(test|spec)\.[jt]sx?$/.test(e.name) &&
      !e.name.endsWith(".d.ts") &&
      !e.name.startsWith("setupTests") &&
      !e.name.startsWith("testUtils")
    ) {
      out.push(full);
    }
  }
  return out;
}

function parse(file) {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

const isStr = (n) =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));

/** in <code> or <kbd>: code, not text */
function inCode(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) {
      const tag = p.openingElement.tagName.getText();
      if (tag === "code" || tag === "kbd") return true;
    }
  }
  return false;
}

/** a template with words of its own, not only values */
function hasWords(node) {
  const lits =
    node.head.text + node.templateSpans.map((s) => s.literal.text).join("");
  return /\p{L}{2,}/u.test(lits);
}

const calleeName = (call) => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return "";
};

/** names and tokens, the same in every language */
const NOT_TEXT = new Set(["mdSilo", "KB", "MB"]);

/** text worth translating: has a letter, not a code-ish token */
function isText(s) {
  const v = s.trim();
  if (!/\p{L}/u.test(v)) return false;
  if (NOT_TEXT.has(v)) return false;
  // a letter or two, or no two letters together: a mark, not a word
  if (/^\S{1,2}$/.test(v) || !/\p{L}{2}/u.test(v)) return false;
  // an email, a %PLACEHOLDER%, a folder, a file extension
  if (/^\S+@\S+$|^%\w+%$|^\.?[\w-]+\/$|^\.\w+$/.test(v)) return false;
  if (/^&[a-z]+;$/i.test(v)) return false;
  // urls, paths, ids, class names
  if (/^(https?:|mailto:|\/|\.\/|#)/.test(v)) return false;
  if (/^[a-z0-9]+([-_.:][a-z0-9]+)+$/.test(v)) return false;
  return true;
}

function line(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function ignored(sf, node) {
  const lines = sf.text.split("\n");
  const n = line(sf, node);
  return (
    /i18n-ignore/.test(lines[n - 1] ?? "") ||
    /i18n-ignore/.test(lines[n - 2] ?? "")
  );
}

/** inside a call of t()/tk()/tn() */
function inKeyCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && KEY_FUNCS.has(calleeName(p))) return true;
    if (ts.isJsxElement(p) || ts.isBlock(p)) return false;
  }
  return false;
}

/** inside the children of JSX, or a UI attribute: a string in an expression */
function inJsxUi(node) {
  for (let p = node.parent; p; p = p.parent) {
    // the value of an attribute, like className="..."
    if (ts.isJsxAttribute(p)) return false;
    if (ts.isJsxExpression(p)) {
      const q = p.parent;
      if (ts.isJsxAttribute(q)) return UI_ATTRS.has(q.name.getText());
      return ts.isJsxElement(q) || ts.isJsxFragment(q);
    }
    if (
      ts.isCallExpression(p) ||
      ts.isBlock(p) ||
      ts.isArrowFunction(p) ||
      ts.isFunctionLike(p) ||
      (ts.isBinaryExpression(p) &&
        p.operatorToken.kind !== ts.SyntaxKind.BarBarToken &&
        p.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken &&
        p.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
    ) {
      return false;
    }
  }
  return false;
}

function find(targets) {
  const files = targets.length
    ? targets.flatMap((t) => {
        const p = path.resolve(t);
        return fs.statSync(p).isDirectory() ? walk(p) : [p];
      })
    : walk(SRC);
  const found = [];
  for (const file of files) {
    const sf = parse(file);
    const add = (node, s, what) => {
      if (!isText(s) || inKeyCall(node) || inCode(node) || ignored(sf, node))
        return;
      found.push({
        file: path.relative(ROOT, file),
        line: line(sf, node),
        what,
        text: s.trim().replace(/\s+/g, " "),
      });
    };
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        add(node, node.text, "jsx");
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText();
        if (UI_ATTRS.has(name) && isStr(node.initializer)) {
          add(node.initializer, node.initializer.text, name);
        }
      } else if (ts.isCallExpression(node) && UI_CALLS.has(calleeName(node))) {
        for (const a of node.arguments) {
          if (isStr(a)) add(a, a.text, calleeName(node) + "()");
          if (ts.isTemplateExpression(a))
            add(a, a.getText(sf), calleeName(node) + "()");
        }
      } else if (
        // in components: in .ts files they are mostly data and names
        file.endsWith(".tsx") &&
        ts.isPropertyAssignment(node) &&
        UI_PROPS.has(node.name.getText(sf)) &&
        (isStr(node.initializer) ||
          (ts.isTemplateExpression(node.initializer) &&
            hasWords(node.initializer)))
      ) {
        const v = node.initializer;
        add(v, isStr(v) ? v.text : v.getText(sf), node.name.getText(sf) + ":");
      } else if (isStr(node) && inJsxUi(node)) {
        add(node, node.text, "jsx-expr");
      } else if (
        ts.isTemplateExpression(node) &&
        inJsxUi(node) &&
        hasWords(node)
      ) {
        add(node, node.getText(sf), "jsx-template");
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  for (const f of found) {
    console.log(`${f.file}:${f.line}\t${f.what}\t${f.text}`);
  }
  const byFile = new Set(found.map((f) => f.file));
  console.error(`\n${found.length} strings in ${byFile.size} files`);
}

/** the keys of t()/tn()/tk() in the source, in the order first seen */
function collectKeys() {
  const keys = new Set();
  const dynamic = [];
  // the module of t() itself
  const self = path.join(SRC, "i18n");
  for (const file of walk(SRC).filter((f) => !f.startsWith(self))) {
    const sf = parse(file);
    const visit = (node) => {
      if (ts.isCallExpression(node) && KEY_FUNCS.has(calleeName(node))) {
        const name = calleeName(node);
        // t(key, params), tk(key), tn(one, other, count, params)
        const args =
          name === "tn"
            ? node.arguments.slice(0, 2)
            : node.arguments.slice(0, 1);
        for (const a of args) {
          if (isStr(a)) keys.add(a.text);
          else
            dynamic.push(
              `${path.relative(ROOT, file)}:${line(sf, node)}\t${node.getText(sf)}`,
            );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { keys: [...keys].sort((a, b) => a.localeCompare(b, "en")), dynamic };
}

function sync(check) {
  const { keys, dynamic } = collectKeys();
  let failed = false;
  const locales = fs.readdirSync(LOCALES).filter((f) => f.endsWith(".json"));
  for (const f of locales) {
    const file = path.join(LOCALES, f);
    const old = JSON.parse(fs.readFileSync(file, "utf8"));
    const next = {};
    for (const k of keys) next[k] = typeof old[k] === "string" ? old[k] : "";
    const added = keys.filter((k) => !(k in old));
    const removed = Object.keys(old).filter((k) => !keys.includes(k));
    const missing = keys.filter((k) => !next[k]);
    if (check) {
      if (added.length || missing.length) failed = true;
    } else {
      fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    }
    console.log(
      `${f}: ${keys.length} keys, +${added.length} -${removed.length}, ${missing.length} untranslated`,
    );
    if (missing.length && (check || process.env.VERBOSE)) {
      for (const k of missing) console.log(`  ${JSON.stringify(k)}`);
    }
  }
  if (dynamic.length) {
    // fine where the strings are marked with tk()
    console.log(
      `\n${dynamic.length} calls with a key that is not a literal: its strings need tk()` +
        (process.env.VERBOSE ? ":" : " (VERBOSE=1 to list them)"),
    );
    if (process.env.VERBOSE) for (const d of dynamic) console.log(`  ${d}`);
  }
  if (failed) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "find") find(rest);
else if (cmd === "sync") sync(rest.includes("--check"));
else {
  console.log("usage: node scripts/i18n.mjs find [path...] | sync [--check]");
  process.exit(cmd ? 1 : 0);
}
