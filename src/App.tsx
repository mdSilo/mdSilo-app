import { invoke } from '@tauri-apps/api/core';
import { useMemo, useEffect } from 'react';
import '@/styles/styles.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrentView } from '@/state/useCurrentView';
import useHotkeys from '@/lib/hooks/useHotkeys';
import useTheme from '@/lib/hooks/useTheme';
import { useStore, onStoreHydrated, SidebarTab } from '@/state/store';
import { isWeb } from '@/workspace/util';
import { openWebWorkspace } from '@/workspace/useOpen';
import FindOrCreateModal from '@/writer/NoteNewModal';
import SideMenu from '@/shell/SideMenu';
import { useAutoSync } from '@/sync/autoSync';
import PublishModal from '@/publish/PublishModal';
import Sidebar from '@/shell/sidebar/Sidebar';
import StatusBar from '@/shell/StatusBar';
import MainView from '@/shell/MainView';
import SettingsModal from '@/shell/settings/SettingsModal';
import AboutModal from '@/shell/settings/AboutModal';

const App = () => {
  const isFindOrCreateModalOpen= useStore((state) => state.isFindOrCreateModalOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);

  useTheme();
  const sideMenuOrientation = useStore((state) => state.sideMenuOrientation);

  const setSidebarTab = useStore((state) => state.setSidebarTab);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const isSettingsOpen = useStore((state) => state.isSettingsOpen);
  const setIsAboutOpen = useStore((state) => state.setIsAboutOpen);
  const isAboutOpen = useStore((state) => state.isAboutOpen); 

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'mod+n',
        callback: () => setIsFindOrCreateModalOpen((isOpen) => !isOpen),
      },
      {
        hotkey: 'alt+x',
        callback: () => setIsSidebarOpen((isOpen) => !isOpen),
      },
      {
        hotkey: 'mod+s',
        callback: () => { /* TODO: for saving */ },
      },
      {
        hotkey: 'mod+shift+d',
        callback: () => setSidebarTab(SidebarTab.Silo),
      },
      {
        hotkey: 'mod+shift+f',
        callback: () => setSidebarTab(SidebarTab.Search),
      },
      {
        hotkey: 'mod+shift+h',
        callback: () => setSidebarTab(SidebarTab.Hashtag),
      },
      {
        hotkey: 'mod+shift+p',
        callback: () => setSidebarTab(SidebarTab.Playlist),
      },
    ],
    [setIsFindOrCreateModalOpen, setIsSidebarOpen, setSidebarTab]
  );
  useHotkeys(hotkeys);

  // web: always work in a folder in IndexedDB, open it once settings
  // (recent / pinned folder) are loaded from storage
  useEffect(() => {
    if (!isWeb) return;
    const open = () => {
      void openWebWorkspace().catch((error) => {
        console.error('Failed to open workspace:', error);
      });
    };
    return onStoreHydrated(open);
  }, []);

  // sync every few minutes and on exit, if set
  useAutoSync();

  useEffect(() => {
    void invoke('close_splashscreen').catch((error) => {
      console.error('Failed to close splashscreen:', error);
    });
  }, []);


  return (
    <ProvideCurrentView>
      <div id="app-container" className="h-screen flex flex-col">
        <div className={`flex w-full h-full bg-base-100 ${
          sideMenuOrientation === 'horizontal'
            ? 'flex-col'
            : sideMenuOrientation === 'vertical'
              ? 'flex-row'
              : 'flex-col md:flex-row'
        }`}>
          <SideMenu />
          {/* min-w-0: shrink to the window, not to the widest content */}
          <div className="relative flex flex-1 min-h-0 min-w-0">
            <Sidebar />
            <div className="relative flex flex-1 flex-col min-w-0 overflow-y-auto">
              <div className="flex items-center justify-center"><StatusBar /></div>
              <MainView />
            </div>
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
        </div>
      </div>
    </ProvideCurrentView>
  )
}

export default App;
