import { useStore } from "@/state/store";
import {
  STARTUP_VIEWS,
  type OpenOnStartup,
  type SideMenuOrientation,
  type StartupView,
} from "@/state/userSettings";
import { Select } from "@/ui/ui";
import { BaseModal } from "@/ui/BaseModal";
import { isTauri } from "@/workspace/util";
import { allCustomThemes } from "@/custom/themes";
import { LANGUAGES, SYSTEM_LANGUAGE, useT } from "@/i18n";
import { ThemeSelect } from "./ThemeEditorModal";

const isSideMenuOrientation = (value: string): value is SideMenuOrientation =>
  value === "auto" || value === "vertical" || value === "horizontal";

const isOpenOnStartup = (value: string): value is OpenOnStartup =>
  value === "previous" || value === "pinned" || value === "none";

const isStartupView = (value: string): value is StartupView =>
  STARTUP_VIEWS.some(([view]) => view === value);

type Props = {
  isOpen: boolean;
  handleClose: () => void;
};

/**
 * The settings of the whole app. The editor, the reader and the feed reader
 * have their own settings, in their views.
 */
export default function SettingsModal({ isOpen, handleClose }: Props) {
  const t = useT();
  const setIsPluginsOpen = useStore((state) => state.setIsPluginsOpen);

  const setThemeEditing = useStore((state) => state.setThemeEditing);
  const theme = useStore((state) => state.theme);
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);
  const current = allCustomThemes({ customThemes, workspaceThemes }).find(
    (t) => `user-${t.id}` === theme,
  );
  // the editor of a theme, in a dialog of its own in place of this one
  const editTheme = (id: string) => {
    handleClose();
    setThemeEditing(id);
  };
  const setIsFontsOpen = useStore((state) => state.setIsFontsOpen);
  const setIsDictionariesOpen = useStore(
    (state) => state.setIsDictionariesOpen,
  );
  const sideMenuOrientation = useStore((state) => state.sideMenuOrientation);
  const setSideMenuOrientation = useStore(
    (state) => state.setSideMenuOrientation,
  );
  const openOnStartup = useStore((state) => state.openOnStartup);
  const setOpenOnStartup = useStore((state) => state.setOpenOnStartup);
  const language = useStore((state) => state.language);
  const setLanguage = useStore((state) => state.setLanguage);
  const startupView = useStore((state) => state.startupView);
  const setStartupView = useStore((state) => state.setStartupView);

  return (
    <BaseModal title={t("Settings")} isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col flex-1 gap-3 p-3 text-sm bg-base-200">
        <Select label={t("Language")} value={language} onChange={setLanguage}>
          <option value={SYSTEM_LANGUAGE}>{t("Follow System")}</option>
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
        <ThemeSelect />
        <div className="flex justify-end gap-2">
          {current ? (
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => editTheme(current.id)}
            >
              {t("Edit Theme")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => editTheme("new")}
          >
            {t("New Theme")}
          </button>
        </div>
        <Select
          label={t("Side Menu Orientation")}
          value={sideMenuOrientation}
          onChange={(value) => {
            if (isSideMenuOrientation(value)) setSideMenuOrientation(value);
          }}
        >
          <option value="auto">{t("Auto (responsive)")}</option>
          <option value="vertical">{t("Vertical")}</option>
          <option value="horizontal">{t("Horizontal")}</option>
        </Select>
        <Select
          label={t("Open on Startup")}
          value={openOnStartup}
          onChange={(value) => {
            if (isOpenOnStartup(value)) setOpenOnStartup(value);
          }}
        >
          <option value="previous">{t("Previous Folder")}</option>
          <option value="pinned">{t("Pinned Folder")}</option>
          <option value="none">{t("Nothing")}</option>
        </Select>
        <Select
          label={t("View on Startup")}
          value={startupView}
          onChange={(value) => {
            if (isStartupView(value)) setStartupView(value);
          }}
        >
          {STARTUP_VIEWS.map(([view, name]) => (
            <option key={view} value={view}>
              {t(name)}
            </option>
          ))}
        </Select>
        <SettingsLink
          label={t("Fonts")}
          action={t("Manage Fonts")}
          onClick={() => {
            handleClose();
            setIsFontsOpen(true);
          }}
        />
        <SettingsLink
          label={t("Dictionaries")}
          action={t("Manage Dictionaries")}
          onClick={() => {
            handleClose();
            setIsDictionariesOpen(true);
          }}
        />
        {isTauri ? (
          <SettingsLink
            label={t("Plugins")}
            action={t("Manage Plugins")}
            onClick={() => {
              handleClose();
              setIsPluginsOpen(true);
            }}
          />
        ) : null}
        <p className="mt-2 text-xs text-center text-base-content/70">
          {t(
            "The editor, the reader and the feed reader have their own settings, in their views; the fonts added in Fonts show in their font lists.",
          )}
        </p>
      </div>
    </BaseModal>
  );
}

/** A row of the settings that opens a dialog of its own */
function SettingsLink({
  label,
  action,
  onClick,
}: {
  label: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <button type="button" className="btn btn-xs" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}
