import { invoke } from '@tauri-apps/api/tauri';
import { useMemo, useEffect } from 'react';
import classNames from 'classnames';
import 'styles/styles.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrentView } from 'context/useCurrentView';
import useHotkeys from 'editor/hooks/useHotkeys';
import { useStore, SidebarTab } from 'lib/store';
import SideMenu from './sidebar/SideMenu';
import Sidebar from './sidebar/Sidebar';
import MainView from './view/MainView';
import FindOrCreateModal from './note/NoteNewModal';
import SettingsModal from './settings/SettingsModal';
import AboutModal from './settings/AboutModal';
import MsgModal from './settings/MsgModal';

const App = () => {
  const isFindOrCreateModalOpen= useStore((state) => state.isFindOrCreateModalOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);

  const darkMode = useStore((state) => state.darkMode);

  const setSidebarTab = useStore((state) => state.setSidebarTab);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);
  const isSettingsOpen = useStore((state) => state.isSettingsOpen);
  const setIsAboutOpen = useStore((state) => state.setIsAboutOpen);
  const isAboutOpen = useStore((state) => state.isAboutOpen); 

  const msgModalText = useStore((state) => state.msgModalText);
  const setMsgModalText = useStore((state) => state.setMsgModalText);
  const msgModalOpen = useStore((state) => state.msgModalOpen);
  const setMsgModalOpen = useStore((state) => state.setMsgModalOpen);
  const isMsgOpen = msgModalOpen && Boolean(msgModalText.trim());
  const handleCloseMsg = () => { 
    setMsgModalOpen(false);
    setMsgModalText('');
  };

  const hotkeys = useMemo(
    () => [
      {
        hotkey: 'alt+n',
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
    ],
    [setIsFindOrCreateModalOpen, setIsSidebarOpen, setSidebarTab]
  );
  useHotkeys(hotkeys);

  useEffect(() => {
    const closeSplash = () => { invoke('close_splashscreen'); };
    document.addEventListener('DOMContentLoaded', closeSplash);

    return () => {
      document.removeEventListener('DOMContentLoaded', closeSplash, true);
    };
  }, []);

  const appContainerClassName = classNames('h-screen', { dark: darkMode });

  return (
    <ProvideCurrentView>
      <div id="app-container" className={appContainerClassName}>
        <div className="flex w-full h-full dark:bg-gray-900">
          <SideMenu />
          <Sidebar />
          <div className="relative flex flex-col flex-1 overflow-y-auto">
            <MainView />
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
          <MsgModal 
            isOpen={isMsgOpen}
            msg={msgModalText}
            handleClose={handleCloseMsg} 
          />
        </div>
      </div>
    </ProvideCurrentView>
  )
}

export default App;
