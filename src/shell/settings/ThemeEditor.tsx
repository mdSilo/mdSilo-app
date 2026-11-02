import { useEffect, useState } from "react";
import copy from "copy-to-clipboard";
import { store, useStore } from "@/state/store";
import { LIGHT_THEME, THEMES } from "@/lib/themes";
import {
  allCustomThemes,
  applyThemeCss,
  deleteTheme,
  lowContrast,
  MIN_CONTRAST,
  parseThemeCss,
  saveTheme,
  THEME_COLORS,
  themeCss,
  themeName,
  themeVarsOf,
  toHex,
  type CustomTheme,
} from "@/custom/themes";
import { dataRoot } from "@/workspace/layout";
import { Range, Toggle } from "@/ui/ui";

type Props = {
  /** the theme to edit, or undefined for a new one */
  theme?: CustomTheme;
  onDone: () => void;
};

/** The sizes with a slider: the radii in rem, the border in px */
const SLIDERS: {
  key: string;
  label: string;
  max: number;
  step: number;
  unit: string;
}[] = [
  {
    key: "--radius-box",
    label: "Radius of boxes",
    max: 2,
    step: 0.125,
    unit: "rem",
  },
  {
    key: "--radius-field",
    label: "Radius of fields",
    max: 2,
    step: 0.125,
    unit: "rem",
  },
  {
    key: "--radius-selector",
    label: "Radius of selectors",
    max: 2,
    step: 0.125,
    unit: "rem",
  },
  { key: "--border", label: "Border", max: 3, step: 0.5, unit: "px" },
];

/** A new theme from the theme applied now. */
function newTheme(): CustomTheme {
  const { darkMode } = store.getState();
  const applied = document.documentElement.dataset.theme || LIGHT_THEME.name;
  return {
    id: crypto.randomUUID(),
    name: "My Theme",
    dark: darkMode,
    vars: themeVarsOf(applied),
    where: dataRoot() ? "workspace" : "device",
  };
}

/**
 * Edit a theme made by the user: its colors (each with the color of its
 * content), start from a theme, import or export it as CSS. The draft is
 * shown in the preview, the app keeps its theme until saved.
 */
export default function ThemeEditor({ theme, onDone }: Props) {
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);
  const [draft, setDraft] = useState<CustomTheme>(() => theme ?? newTheme());
  const [cssText, setCssText] = useState("");
  const [error, setError] = useState("");
  const hasWorkspace = Boolean(dataRoot());

  // the draft as a theme of its own, for the preview
  const preview = { ...draft, id: "draft" };
  useEffect(() => {
    applyThemeCss(allCustomThemes({ customThemes, workspaceThemes }), preview);
    return () => applyThemeCss(allCustomThemes(store.getState()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, customThemes, workspaceThemes]);

  const setVar = (key: string, value: string) =>
    setDraft((d) => ({ ...d, vars: { ...d.vars, [key]: value } }));
  const lowPairs = lowContrast(draft.vars);

  const startFrom = (name: string) => {
    const info = THEMES.find((t) => t.name === name);
    setDraft((d) => ({
      ...d,
      vars: themeVarsOf(name),
      dark: info?.dark ?? d.dark,
    }));
  };

  const importCss = () => {
    const parsed = parseThemeCss(cssText);
    if (!Object.keys(parsed.vars).length) {
      setError("No theme variables (--color-…) found");
      return;
    }
    setError("");
    setDraft((d) => ({
      ...d,
      name: parsed.name || d.name,
      dark: parsed.dark,
      vars: { ...d.vars, ...parsed.vars },
    }));
    setCssText("");
  };

  const onSave = async () => {
    try {
      const saved = { ...draft, name: draft.name.trim() || "My Theme" };
      await saveTheme(saved);
      store.getState().setTheme(themeName(saved));
      onDone();
    } catch (e) {
      setError(String(e));
    }
  };

  const onDelete = async () => {
    if (theme) await deleteTheme(theme.id);
    onDone();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="theme-editor">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 input input-xs"
          aria-label="Theme Name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <select
          className="w-32 select select-xs"
          aria-label="Start From"
          value=""
          onChange={(e) => startFrom(e.target.value)}
        >
          <option value="" disabled>
            Start from…
          </option>
          {THEMES.map((t) => (
            <option key={t.name} value={t.name}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <Toggle
        label="Dark"
        checked={draft.dark}
        onChange={(dark) => setDraft((d) => ({ ...d, dark }))}
      />

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {THEME_COLORS.map((color) => {
          const key = `--color-${color}`;
          return (
            <label
              key={color}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{color}</span>
              <input
                type="color"
                className="w-8 h-5 p-0 border rounded cursor-pointer"
                aria-label={color}
                value={toHex(draft.vars[key] ?? "") || "#000000"}
                onChange={(e) => setVar(key, e.target.value)}
              />
            </label>
          );
        })}
      </div>
      {lowPairs.length ? (
        <div
          role="status"
          className="flex flex-col gap-0.5 p-2 text-xs rounded-box bg-warning/15"
        >
          <span>Hard to read (below {MIN_CONTRAST}:1):</span>
          {lowPairs.map(({ bg, fg, ratio }) => (
            <span key={bg}>
              {fg} on {bg}: {ratio.toFixed(1)}:1
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        {SLIDERS.map(({ key, label, max, step, unit }) => (
          <Range
            key={key}
            label={label}
            min={0}
            max={max}
            step={step}
            value={parseFloat(draft.vars[key] ?? "") || 0}
            format={(v) => `${v}${unit}`}
            onChange={(v) => setVar(key, `${v}${unit}`)}
          />
        ))}
      </div>

      <div
        data-theme={themeName(preview)}
        className="flex flex-col gap-2 p-3 border rounded-box bg-base-100 text-base-content"
        aria-label="Theme Preview"
      >
        <div className="flex gap-2 p-2 rounded-box bg-base-200">
          <span className="text-sm">Text on base</span>
          <span className="text-sm text-base-content/60">muted</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn btn-xs btn-primary">
            Primary
          </button>
          <button type="button" className="btn btn-xs btn-secondary">
            Secondary
          </button>
          <button type="button" className="btn btn-xs btn-accent">
            Accent
          </button>
          <button type="button" className="btn btn-xs btn-neutral">
            Neutral
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="badge badge-info badge-sm">info</span>
          <span className="badge badge-success badge-sm">success</span>
          <span className="badge badge-warning badge-sm">warning</span>
          <span className="badge badge-error badge-sm">error</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 input input-xs"
            placeholder="A field"
            aria-label="Preview Field"
          />
          <input
            type="checkbox"
            className="checkbox checkbox-xs checkbox-primary"
            aria-label="Preview Checkbox"
            defaultChecked
          />
          <input
            type="checkbox"
            className="toggle toggle-xs toggle-primary"
            aria-label="Preview Toggle"
            defaultChecked
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <textarea
          className="w-full h-16 font-mono textarea textarea-xs"
          placeholder="Paste a daisyUI theme (CSS) to import it"
          aria-label="Theme CSS"
          value={cssText}
          onChange={(e) => setCssText(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-xs"
            disabled={!cssText.trim()}
            onClick={importCss}
          >
            Import
          </button>
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => copy(themeCss([draft]))}
          >
            Copy as CSS
          </button>
        </div>
      </div>

      <Toggle
        label="Sync with workspace"
        checked={draft.where === "workspace"}
        onChange={(sync) =>
          setDraft((d) => ({
            ...d,
            where: sync && hasWorkspace ? "workspace" : "device",
          }))
        }
      />
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {theme ? (
          <button
            type="button"
            className="mr-auto btn btn-xs btn-error btn-outline"
            onClick={() => void onDelete()}
          >
            Delete
          </button>
        ) : null}
        <button type="button" className="btn btn-xs" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-xs btn-primary"
          onClick={() => void onSave()}
        >
          Save
        </button>
      </div>
    </div>
  );
}
