import { useRef, useState } from "react";
import { TbTrash as IconTrash } from "react-icons/tb";
import { useStore } from "@/state/store";
import { dataRoot } from "@/workspace/layout";
import { moveTo } from "@/custom/store";
import {
  addSystemFont,
  FONT_FILE_TYPES,
  fonts,
  importFont,
  removeFont,
  useFonts,
  useSystemFonts,
  type CustomFont,
} from "@/custom/fonts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The fonts added by the user: font files imported, or system fonts by name. */
export default function FontsSetting() {
  const customFonts = useFonts();
  const systemFonts = useSystemFonts();
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  const hasWorkspace = Boolean(dataRoot({ initDir, layout }));
  const inputRef = useRef<HTMLInputElement>(null);
  const [systemFont, setSystemFont] = useState("");
  const [error, setError] = useState("");

  const onFiles = async (files: FileList | null) => {
    setError("");
    for (const file of Array.from(files ?? [])) {
      try {
        await importFont(file);
      } catch (e) {
        console.error("Failed to import font:", e);
        setError(`Not a font file: ${file.name}`);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const onSync = (font: CustomFont, on: boolean) => {
    setError("");
    moveTo(fonts, font, on ? "workspace" : "device").catch((e) =>
      setError(errorText(e)),
    );
  };

  const onAddSystemFont = () => {
    if (!systemFont.trim()) return;
    addSystemFont(systemFont);
    setSystemFont("");
  };

  return (
    <div className="flex flex-col gap-2" data-testid="fonts-setting">
      <div className="flex items-center justify-between">
        <span>Fonts</span>
        <button
          type="button"
          className="btn btn-xs"
          onClick={() => inputRef.current?.click()}
        >
          Import Font Files
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={FONT_FILE_TYPES.map((t) => `.${t}`).join(",")}
          aria-label="Font Files"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAddSystemFont();
        }}
      >
        <input
          className="flex-1 input input-xs"
          placeholder="Installed font, e.g. Noto Serif"
          aria-label="System Font Name"
          list={systemFonts.length > 0 ? "system-fonts" : undefined}
          value={systemFont}
          onChange={(e) => setSystemFont(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-xs"
          disabled={!systemFont.trim()}
        >
          Add
        </button>
      </form>
      {systemFonts.length > 0 ? (
        <datalist id="system-fonts">
          {systemFonts.map((family) => (
            <option key={family} value={family} />
          ))}
        </datalist>
      ) : null}
      {error ? <p className="text-xs text-error">{error}</p> : null}
      {customFonts.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {customFonts.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <span
                className="flex-1 truncate"
                style={{ fontFamily: `'${f.family}'` }}
              >
                {f.family}
              </span>
              <span className="text-xs truncate text-base-content/60">
                {f.fileName || "system"}
              </span>
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                aria-label={`Sync ${f.family} with workspace`}
                title="Sync with workspace"
                checked={f.where === "workspace"}
                disabled={f.where === "device" && !hasWorkspace}
                onChange={(e) => onSync(f, e.target.checked)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                aria-label={`Remove ${f.family}`}
                onClick={() => void removeFont(f.id)}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-base-content/70">
        Added fonts show in the editor and reader font lists, and so do the
        fonts installed on this computer (System). Checked, a font is kept in
        the workspace (.mdsilo/fonts/) and synced with it; otherwise it stays on
        this device.
      </p>
    </div>
  );
}
