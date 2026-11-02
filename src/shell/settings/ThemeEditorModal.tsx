import { useStore } from "@/state/store";
import { SYSTEM_THEME, THEMES } from "@/lib/themes";
import { allCustomThemes } from "@/custom/themes";
import { BaseModal } from "@/ui/BaseModal";
import { Select } from "@/ui/ui";
import ThemeEditor from "./ThemeEditor";

/** The theme select, with the themes made by the user */
export function ThemeSelect() {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);
  const userThemes = allCustomThemes({ customThemes, workspaceThemes });
  return (
    <Select label="Theme" value={theme} onChange={setTheme}>
      <option value={SYSTEM_THEME}>Follow System</option>
      {THEMES.map((t) => (
        <option key={t.name} value={t.name}>
          {t.label}
        </option>
      ))}
      {userThemes.length > 0 ? (
        <optgroup label="My Themes">
          {userThemes.map((t) => (
            <option key={t.id} value={`user-${t.id}`}>
              {t.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}

/**
 * The editor of a theme in a dialog of its own: opened by New Theme or
 * Edit Theme of the settings, closed when saved, deleted or cancelled.
 */
export default function ThemeEditorModal() {
  const editing = useStore((state) => state.themeEditing);
  const setEditing = useStore((state) => state.setThemeEditing);
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);
  const theme = editing
    ? allCustomThemes({ customThemes, workspaceThemes }).find(
        (t) => t.id === editing,
      )
    : undefined;
  return (
    <BaseModal
      title={theme ? "Edit Theme" : "New Theme"}
      scrollBody
      isOpen={editing !== null}
      handleClose={() => setEditing(null)}
    >
      <div className="p-3 text-sm text-left bg-base-200">
        {editing ? (
          <ThemeEditor
            key={editing}
            theme={theme}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </div>
    </BaseModal>
  );
}
