import { useState } from "react";
import { TbFolderOpen } from "react-icons/tb";
import { BaseModal } from "@/ui/BaseModal";
import { openDirDilog } from "@/workspace/open";
import { useT } from "@/i18n";
import {
  FORMAT_GROUPS,
  withImportDefaults,
  type FolderImportOptions,
} from "./folderImport";

type Props = {
  /** the choices of the last time */
  initial?: Partial<FolderImportOptions>;
  /** the group opened, where the books go when not grouped by folders */
  group: string;
  onClose: () => void;
  onImport: (options: FolderImportOptions) => void;
};

/** The folder to import books from, the formats, the size, the groups */
export default function ImportFolderDialog({
  initial,
  group,
  onClose,
  onImport,
}: Props) {
  const t = useT();
  const [options, setOptions] = useState(() => withImportDefaults(initial));
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<FolderImportOptions>) =>
    setOptions((o) => ({ ...o, ...patch }));
  const folderName =
    options.dir
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || "Folder";

  const pick = async () => {
    setPicking(true);
    try {
      const dir = await openDirDilog();
      if (typeof dir === "string" && dir) set({ dir });
    } finally {
      setPicking(false);
    }
  };

  return (
    <BaseModal
      title={t("Import books from a folder")}
      isOpen
      handleClose={onClose}
      panelClassName="max-w-md"
    >
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (options.dir && options.formats.length) onImport(options);
        }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-base-content/70">{t("Folder")}</span>
          <button
            type="button"
            className="flex items-center w-full gap-2 px-3 py-2 text-sm text-left border rounded-lg border-base-300 bg-base-200/40 hover:bg-base-200"
            onClick={pick}
            disabled={picking}
            title={options.dir || t("Choose a folder")}
            aria-label={t("Choose a folder")}
          >
            <TbFolderOpen size={18} className="shrink-0 text-base-content/70" />
            <span
              className={`flex-1 min-w-0 truncate ${options.dir ? "" : "text-base-content/50"}`}
            >
              {options.dir || t("Choose a folder")}
            </span>
          </button>
          <span className="text-xs text-base-content/60">
            {t(
              "With its sub folders; the books are copied into the reading folder.",
            )}
          </span>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-base-content/70">
            {t("File formats")}
          </legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {FORMAT_GROUPS.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-2 px-1 py-1 text-sm rounded-md cursor-pointer hover:bg-base-200/50"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={options.formats.includes(g.id)}
                  onChange={(e) =>
                    set({
                      formats: e.target.checked
                        ? [...options.formats, g.id]
                        : options.formats.filter((id) => id !== g.id),
                    })
                  }
                />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("File size larger than")}</span>
          <span className="flex items-center w-28 gap-1 input input-sm">
            <input
              type="number"
              min={0}
              step={1}
              className="w-full text-right"
              aria-label={t("Minimum file size (KB)")}
              value={options.minSizeKB}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                set({ minSizeKB: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
            />
            <span className="text-xs text-base-content/60">KB</span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-base-content/70">
            {t("Groups")}
          </legend>
          <label className="flex items-start gap-2 px-1 py-1 text-sm rounded-md cursor-pointer hover:bg-base-200/50">
            <input
              type="radio"
              name="folder-import-mode"
              className="radio radio-sm mt-0.5"
              checked={!options.flatten}
              onChange={() => set({ flatten: false })}
            />
            <span>
              <span className="block">{t("Groups from the folders")}</span>
              <span className="block text-xs text-base-content/60">
                {t(
                  "Each book in the group of its folder: e.g. {folder}, {folder}/Fiction.",
                  {
                    folder: folderName,
                  },
                )}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 px-1 py-1 text-sm rounded-md cursor-pointer hover:bg-base-200/50">
            <input
              type="radio"
              name="folder-import-mode"
              className="radio radio-sm mt-0.5"
              checked={options.flatten}
              onChange={() => set({ flatten: true })}
            />
            <span>
              <span className="block">
                {group
                  ? t("All in the group {group}", { group })
                  : t("All in the library, no group")}
              </span>
              <span className="block text-xs text-base-content/60">
                {t("Every book found, whatever its folder.")}
              </span>
            </span>
          </label>
          <span className="text-xs text-base-content/60">
            {t(
              "The books in the library already are not copied again, but go in the group too.",
            )}
          </span>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={!options.dir || options.formats.length === 0}
          >
            {t("Import")}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
