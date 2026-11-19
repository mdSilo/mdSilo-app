import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { flushAll } from "@/shell/flushAll";

/**
 * The self updater of the desktop app: a new version from the GitHub
 * releases, see src-tauri/src/updater.rs. Checked on startup
 * (UpdatePrompt, the setting checkForUpdates) and from About.
 */

export const RELEASES_URL = "https://github.com/mdSilo/mdSilo-app/releases";

/** the page of a release: what is new, the downloads */
export const releaseUrl = (version: string) =>
  `${RELEASES_URL}/tag/mdsilo-v${version}`;

export type UpdateInfo = {
  version: string;
  currentVersion: string;
  date?: string | null;
  notes?: string | null;
  /** false in a build that cannot replace itself: download it instead */
  canInstall: boolean;
};

type Progress = { downloaded: number; total?: number | null };

export type UpdaterState = {
  status: "idle" | "checking" | "latest" | "available" | "installing" | "error";
  update: UpdateInfo | null;
  /** 0–100 while installing, null when the size is not known */
  percent: number | null;
  error: string | null;
  /** the prompt was closed for this run */
  dismissed: boolean;
};

export const useUpdater = create<UpdaterState>(() => ({
  status: "idle",
  update: null,
  percent: null,
  error: null,
  dismissed: false,
}));

/** Ask GitHub for a newer version; the answer is in useUpdater. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const { status } = useUpdater.getState();
  if (status === "checking" || status === "installing") {
    return useUpdater.getState().update;
  }
  useUpdater.setState({ status: "checking", update: null, error: null });
  try {
    const update = await invoke<UpdateInfo | null>("update_check");
    useUpdater.setState({
      status: update ? "available" : "latest",
      update,
    });
    return update;
  } catch (e) {
    useUpdater.setState({ status: "error", error: String(e) });
    return null;
  }
}

/**
 * Save what waits to be saved, download and install the update, restart.
 * Resolves only on failure: the app restarts on success.
 */
export async function installUpdate(): Promise<void> {
  if (useUpdater.getState().status !== "available") return;
  useUpdater.setState({ status: "installing", percent: 0, error: null });
  const unlisten = await listen<Progress>("update-progress", ({ payload }) => {
    const { downloaded, total } = payload;
    useUpdater.setState({
      percent: total
        ? Math.min(100, Math.round((downloaded / total) * 100))
        : null,
    });
  });
  try {
    await flushAll();
    await invoke("update_install");
  } catch (e) {
    // the update of the check is used up (check again to retry); kept here
    // for the link to download it
    useUpdater.setState({ status: "error", error: String(e) });
  } finally {
    unlisten();
  }
}
