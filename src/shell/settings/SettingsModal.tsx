import { useState } from "react";
import { useStore } from "@/state/store";
import {
  STARTUP_VIEWS,
  type OpenOnStartup,
  type SideMenuOrientation,
  type StartupView,
} from "@/state/userSettings";
import { SYSTEM_THEME, THEMES } from "@/lib/themes";
import { Select } from "@/ui/ui";
import { allCustomThemes } from "@/custom/themes";
import { BaseModal } from "@/ui/BaseModal";
import { isTauri } from "@/workspace/util";
import ThemeEditor from "./ThemeEditor";
import FontsSetting from "./FontsSetting";

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
  const setIsPluginsOpen = useStore((state) => state.setIsPluginsOpen);

  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const customThemes = useStore((state) => state.customThemes);
  const workspaceThemes = useStore((state) => state.workspaceThemes);
  const userThemes = allCustomThemes({ customThemes, workspaceThemes });
  const current = userThemes.find((t) => `user-${t.id}` === theme);
  // the theme edited: a theme made by the user, or 'new'
  const [editing, setEditing] = useState<string | null>(null);
  const sideMenuOrientation = useStore((state) => state.sideMenuOrientation);
  const setSideMenuOrientation = useStore(
    (state) => state.setSideMenuOrientation,
  );
  const openOnStartup = useStore((state) => state.openOnStartup);
  const setOpenOnStartup = useStore((state) => state.setOpenOnStartup);
  const startupView = useStore((state) => state.startupView);
  const setStartupView = useStore((state) => state.setStartupView);

  return (
    <BaseModal title="Settings" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col flex-1 gap-3 p-3 text-sm bg-base-200">
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
        {editing ? (
          <ThemeEditor
            key={editing}
            theme={userThemes.find((t) => t.id === editing)}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className="flex justify-end gap-2">
            {current ? (
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => setEditing(current.id)}
              >
                Edit Theme
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => setEditing("new")}
            >
              New Theme
            </button>
          </div>
        )}
        <Select
          label="Side Menu Orientation"
          value={sideMenuOrientation}
          onChange={(value) => {
            if (isSideMenuOrientation(value)) setSideMenuOrientation(value);
          }}
        >
          <option value="auto">Auto (responsive)</option>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </Select>
        <Select
          label="Open on Startup"
          value={openOnStartup}
          onChange={(value) => {
            if (isOpenOnStartup(value)) setOpenOnStartup(value);
          }}
        >
          <option value="previous">Previous Folder</option>
          <option value="pinned">Pinned Folder</option>
          <option value="none">Nothing</option>
        </Select>
        <Select
          label="View on Startup"
          value={startupView}
          onChange={(value) => {
            if (isStartupView(value)) setStartupView(value);
          }}
        >
          {STARTUP_VIEWS.map(([view, name]) => (
            <option key={view} value={view}>
              {name}
            </option>
          ))}
        </Select>
        <FontsSetting />
        {isTauri ? (
          <div className="flex items-center justify-between">
            <span>Plugins</span>
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => {
                handleClose();
                setIsPluginsOpen(true);
              }}
            >
              Manage Plugins
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-center text-base-content/70">
          The editor, the reader and the feed reader have their own settings, in
          their views; the fonts added here show in their font lists.
        </p>
      </div>
    </BaseModal>
  );
}
