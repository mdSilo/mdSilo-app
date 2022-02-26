import { useState } from 'react';
import classNames from 'classnames';
import 'styles/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrentView } from 'context/useCurrentView';
import { useStore } from 'lib/store';
import SideMenu from './sidebar/SideMenu';
import Sidebar from './sidebar/Sidebar';
import MainView from './view/MainView';
import FindOrCreateModal from './note/NoteNewModal';
import SettingsModal from './settings/SettingsModal';

const App = () => {
  const [isFindOrCreateModalOpen, setIsFindOrCreateModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const darkMode = useStore((state) => state.darkMode);
  const appContainerClassName = classNames(
    'h-screen',
    { dark: darkMode },
  );

  return (
    <ProvideCurrentView>
      <div id="app-container" className={appContainerClassName}>
        <div className="flex w-full h-full dark:bg-gray-900">
          <SideMenu />
          <Sidebar
            setIsFindOrCreateModalOpen={setIsFindOrCreateModalOpen}
            setIsSettingsOpen={setIsSettingsOpen}
          />
          <div className="relative flex flex-col flex-1 overflow-y-auto">
            <MainView />
          </div>
          {isFindOrCreateModalOpen ? (
            <FindOrCreateModal setIsOpen={setIsFindOrCreateModalOpen} />
          ) : null}
          {isSettingsOpen ? (
            <SettingsModal 
              isOpen={isSettingsOpen}
              handleClose={() => setIsSettingsOpen(false)} 
            />
          ) : null}
        </div>
      </div>
    </ProvideCurrentView>
  )
}

export default App
