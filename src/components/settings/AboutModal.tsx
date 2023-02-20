import { getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { writeText } from '@tauri-apps/api/clipboard';
import { useState, useEffect } from 'react';
import { openUrl } from 'file/open';
import { getLog, clearLog } from 'file/storage';
import { BaseModal } from './BaseModal';


type Props = {
  isOpen: boolean;
  handleClose: () => void;
}

export default function AboutModal({ isOpen, handleClose }: Props) {
  const [appVersion, setAppVersion] = useState('');
  const [tauriVersion, setTauriVersion] = useState('');
  const [hasVersion, setHasVersion] = useState(false);

  useEffect(() => {
    if (!hasVersion) {
      getVersion().then(ver => setAppVersion(ver)).catch(() => {/**/});
      getTauriVersion().then(ver => setTauriVersion(ver)).catch(() => {/**/});
    }
    return () => { setHasVersion(true); };
  }, [hasVersion]);

  return (
    <BaseModal title="About" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <h1>mdSilo Desktop</h1>
        <p className="mt-4 font-bold">App Version: {appVersion}</p>
        <p className="mt-4 font-bold">Tauri Version: {tauriVersion}</p>
        <div className="flex justify-center px-2">
          <button 
            className="link m-2"
            onClick={async () => { await clearLog(); }}
          >
            Clear Log
          </button>
          <button 
            className="link m-2"
            onClick={async () => { 
              await writeText(`App: ${appVersion} \n Tauri: ${tauriVersion}`);
            }}
          >
            Copy About
          </button>
          <button 
            className="link m-2"
            onClick={async () => { 
              const log = await getLog();
              // console.log("log", log);
              await writeText(JSON.stringify(log));
            }}
          >
            Copy Log
          </button>
        </div>
        <button
          className="mt-4 font-bold pop-btn" 
          onClick={async () => {
            await openUrl("https://github.com/mdSilo/mdSilo-app/releases");
          }}
        >
          Check for Updates
        </button>
      </div>
    </BaseModal>
  );
}
