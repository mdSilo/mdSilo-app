import { invoke } from '@tauri-apps/api/core';
import { useMemo, useEffect } from 'react';
import '../styles/styles.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrentView } from 'context/useCurrentView';
import useHotkeys from 'editor/hooks/useHotkeys';
import { useStore, onStoreHydrated, SidebarTab } from 'lib/store';
import { isWeb } from 'file/util';
import { openWebWorkspace } from 'editor/hooks/useOpen';
import SideMenu from './sidebar/SideMenu';
import Sidebar from './sidebar/Sidebar';
import StatusBar from './sidebar/StatusBar';
import MainView from './view/MainView';
import FindOrCreateModal from './note/NoteNewModal';
import SettingsModal from './settings/SettingsModal';
import AboutModal from './settings/AboutModal';

const App = () => {
  const isFindOrCreateModalOpen= useStore((state) => state.isFindOrCreateModalOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);

  const darkMode = useStore((state) => state.darkMode);
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

  useEffect(() => {
    void invoke('close_splashscreen').catch((error) => {
      console.error('Failed to close splashscreen:', error);
    });
  }, []);

  const appContainerClassName = `h-screen flex flex-col ${darkMode ? 'dark' : ''}`;

  return (
    <ProvideCurrentView>
      <div id="app-container" className={appContainerClassName}>
        <div className={`flex w-full h-full dark:bg-gray-900 ${
          sideMenuOrientation === 'horizontal'
            ? 'flex-col'
            : sideMenuOrientation === 'vertical'
              ? 'flex-row'
              : 'flex-col md:flex-row'
        }`}>
          <SideMenu />
          <div className="relative flex flex-1 min-h-0">
            <Sidebar />
            <div className="relative flex flex-1 flex-col overflow-y-auto">
              <div className="flex items-center justify-center"><StatusBar /></div>
              <MainView />
            </div>
          </div>
          {isFindOrCreateModalOpen ? (
            <FindOrCreateModal setIsOpen={setIsFindOrCreateModalOpen} />
          ) : null}
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
