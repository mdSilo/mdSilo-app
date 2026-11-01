import { useRef, useState } from "react";
import { TbTrash as IconTrash } from "react-icons/tb";
import { useStore } from "@/state/store";
import {
  addSystemFont,
  FONT_FILE_TYPES,
  importFont,
  removeFont,
} from "@/custom/fonts";

/** The fonts added by the user: font files imported, or system fonts by name. */
export default function FontsSetting() {
  const customFonts = useStore((state) => state.customFonts);
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
        Added fonts show in the editor and reader font lists, on this device.
      </p>
    </div>
  );
}
