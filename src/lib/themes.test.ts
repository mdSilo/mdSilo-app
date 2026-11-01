import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { EDITOR_THEME } from "./themes";

const SRC = join(__dirname, "..");

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

// colors over images or user-picked colors, the same in any theme
const ALLOWED = new Set([
  "reader/media/MediaViewer.tsx",
  "reader/components/BookPopups.tsx",
  "writer/NoteNewModal.tsx",
  "writer/NoteMoveModal.tsx",
  "ui/BaseModal.tsx",
]);

it("uses the colors of the theme, not fixed Tailwind colors", () => {
  const fixed =
    /\b(?:bg|text|border|ring|fill|stroke)-(?:gray|red|blue|green|yellow|purple|emerald|neutral|slate|white|black)\b/;
  const found = sources(SRC)
    .map((path) => relative(SRC, path).replace(/\\/g, "/"))
    .filter(
      (path) =>
        !ALLOWED.has(path) && fixed.test(readFileSync(join(SRC, path), "utf8")),
    );
  expect(found).toEqual([]);
});

it("gives the editor the colors of the theme", () => {
  for (const [key, value] of Object.entries(EDITOR_THEME)) {
    expect(value, key).toMatch(/var\(--color-/);
  }
});
