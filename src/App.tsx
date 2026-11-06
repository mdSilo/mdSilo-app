import { invoke } from "@tauri-apps/api/core";
import { useMemo, useEffect } from "react";
import "@/styles/styles.css";
import "tippy.js/dist/tippy.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ProvideCurrentView } from "@/state/useCurrentView";
import useHotkeys from "@/lib/hooks/useHotkeys";
import useTheme from "@/lib/hooks/useTheme";
import { useCustomFonts } from "@/custom/fonts";
import { useCustomThemes } from "@/custom/themes";
import { usePlugins } from "@/plugins/registry";
import { PluginsModal } from "@/plugins/PluginManager";
import { PluginAnswerModal } from "@/plugins/PluginAnswer";
import { TrustedPlugins } from "@/plugins/trusted";
import { SharedBookPrompt } from "@/reader/library/SharedBookPrompt";
import { PluginDev } from "@/plugins/dev";
import ThemeEditorModal from "@/shell/settings/ThemeEditorModal";
import FontsModal from "@/shell/settings/FontsModal";
import { useStore, onStoreHydrated, SidebarTab } from "@/state/store";
import { hasWindows, shareSettings } from "@/state/windowSync";
import { flushSave } from "@/workspace/pendingSaves";
import { issueStore } from "@/issue/issueStore";
import { useReaderStore, useSideStore } from "@/reader/readerStore";
import { isWeb } from "@/workspace/util";
import { openWebWorkspace } from "@/workspace/useOpen";
import FindOrCreateModal from "@/writer/NoteNewModal";
import SideMenu from "@/shell/SideMenu";
import { ViewMenuFallback } from "@/shell/ViewMenu";
import { routeMain } from "@/shell/windows";
import { useAutoSync } from "@/sync/autoSync";
import PublishModal from "@/publish/PublishModal";
import Sidebar from "@/shell/sidebar/Sidebar";
import Player from "@/player/Player";
import MainView from "@/shell/MainView";
import SettingsModal from "@/shell/settings/SettingsModal";
import AboutModal from "@/shell/settings/AboutModal";
import PwaPrompts from "@/shell/PwaPrompts";

const App = () => {
  const isFindOrCreateModalOpen = useStore(
    (state) => state.isFindOrCreateModalOpen,
  );
  const setIsFindOrCreateModalOpen = useStore(
    (state) => state.setIsFindOrCreateModalOpen,
  );

  useTheme();
  useCustomFonts();
  useCustomThemes();
  usePlugins();
  const sideMenuOrientation = useStore((state) => state.sideMenuOrientation);
  // a phone, "auto": no side menu, see ViewMenu
  const menuOnTop = sideMenuOrientation === "horizontal";

  const setSidebarTab = useStore((state) => state.setSidebarTab);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const isSettingsOpen = useStore((state) => state.isSettingsOpen);
  const setIsAboutOpen = useStore((state) => state.setIsAboutOpen);
  const isAboutOpen = useStore((state) => state.isAboutOpen);

  const hotkeys = useMemo(
    () => [
      {
        hotkey: "mod+n",
        callback: () => setIsFindOrCreateModalOpen((isOpen) => !isOpen),
      },
      {
        hotkey: "alt+x",
        callback: () => setIsSidebarOpen((isOpen) => !isOpen),
      },
      {
        hotkey: "mod+s",
        callback: () => {
          /* TODO: for saving */
        },
      },
      {
        hotkey: "mod+shift+d",
        callback: () => setSidebarTab(SidebarTab.Silo),
      },
      {
        hotkey: "mod+shift+f",
        callback: () => setSidebarTab(SidebarTab.Search),
      },
      {
        hotkey: "mod+shift+h",
        callback: () => setSidebarTab(SidebarTab.Hashtag),
      },
      {
        hotkey: "mod+shift+p",
        callback: () => setSidebarTab(SidebarTab.Playlist),
      },
    ],
    [setIsFindOrCreateModalOpen, setIsSidebarOpen, setSidebarTab],
  );
  useHotkeys(hotkeys);

  // web: always work in a folder in IndexedDB, open it once settings
  // (recent / pinned folder) are loaded from storage
  useEffect(() => {
    if (!isWeb) return;
    const open = () => {
      void openWebWorkspace().catch((error) => {
        console.error("Failed to open workspace:", error);
      });
    };
    return onStoreHydrated(open);
  }, []);

  // sync every few minutes and on exit, if set
  useAutoSync();

  // closing the window (or quitting from the tray) leaves no time for the
  // timers of the saves: written first, as in a book window
  useEffect(() => {
    if (!hasWindows) return;
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      try {
        await Promise.all([
          useReaderStore.getState().flush(),
          useSideStore.getState().flush(),
          issueStore.getState().flush(),
          flushSave(),
        ]);
      } catch (e) {
        console.error("Failed to save before closing:", e);
      }
    });
    return () => void unlisten.then((off) => off());
  }, []);

  // the settings changed in the book windows, and theirs
  useEffect(() => shareSettings(), []);

  useEffect(() => {
    void invoke("close_splashscreen").catch((error) => {
      console.error("Failed to close splashscreen:", error);
    });
  }, []);

  return (
    <ProvideCurrentView route={routeMain}>
      {/* the height of the visible area, see #app-container in styles.css */}
      <div id="app-container" className="flex flex-col">
        <div
          className={`flex w-full h-full min-h-0 bg-base-100 ${
            menuOnTop ? "flex-col" : "flex-row"
          }`}
        >
          <SideMenu />
          {/* min-w-0: shrink to the window, not to the widest content */}
          <div className="relative flex flex-1 min-h-0 min-w-0">
            {/* a view without a bar for the menu; under the sidebar */}
            <ViewMenuFallback />
            <Sidebar />
            <div className="relative flex flex-1 flex-col min-w-0 overflow-y-auto">
              <MainView />
            </div>
            <Player />
          </div>
          {isFindOrCreateModalOpen ? (
            <FindOrCreateModal setIsOpen={setIsFindOrCreateModalOpen} />
          ) : null}
          <PublishModal />
          <SettingsModal
            isOpen={isSettingsOpen}
            handleClose={() => setIsSettingsOpen(false)}
          />
          <AboutModal
            isOpen={isAboutOpen}
            handleClose={() => setIsAboutOpen(false)}
          />
          <PluginsModal />
          <ThemeEditorModal />
          <FontsModal />
          <PluginAnswerModal />
          <TrustedPlugins />
          <PluginDev />
          {isWeb ? <PwaPrompts /> : null}
          {isWeb ? <SharedBookPrompt /> : null}
        </div>
      </div>
    </ProvideCurrentView>
  );
};

export default App;
