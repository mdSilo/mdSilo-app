import { getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { arch, platform, version } from '@tauri-apps/api/os';
import { writeText } from '@tauri-apps/api/clipboard';
import { useCallback, useState, useEffect } from 'react';
import { BaseModal } from './BaseModal';

type Props = {
  isOpen: boolean;
  handleClose: () => void;
}

export default function AboutModal({ isOpen, handleClose }: Props) {
  const [appVersion, setAppVersion] = useState('');
  const [tauriVersion, setTauriVersion] = useState('');
  const [osVersion, setOsVersion] = useState('');
  const [hasVersion, setHasVersion] = useState(false);

  const getAppVersion = useCallback(
    async () => setAppVersion(await getVersion()), []
  );
  const getFrameVersion = useCallback(
    async () => setTauriVersion(await getTauriVersion()), []
  );
  const getOsVersion = useCallback(
    // the version is not the kernel version
    async () => setOsVersion(`${await platform()} ${await arch()} ${await version()}`), []
  );
  useEffect(() => {
    if (!hasVersion) {
      getAppVersion();
      getFrameVersion();
      getOsVersion();
    }
    return () => { setHasVersion(true); };
  }, [getAppVersion, getFrameVersion, getOsVersion, hasVersion]);

  return (
    <BaseModal title="About" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <h1>mdSilo Desktop</h1>
        <p className="mt-4 font-bold">App Version: {appVersion}</p>
        <p className="mt-4 font-bold">Tauri Version: {tauriVersion}</p>
        <p className="mt-4 font-bold">OS Version: {osVersion}</p>
        <button className="mt-4 font-bold pop-btn" onClick={() => writeText(`App: ${appVersion} Tauri: ${tauriVersion} OS: ${osVersion}`)}>
          Copy
        </button>
      </div>
    </BaseModal>
  );
}
