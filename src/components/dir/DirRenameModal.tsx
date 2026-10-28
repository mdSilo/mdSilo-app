import { useState } from 'react';
import { BaseModal } from '@/components/settings/BaseModal';
import { renameFile, joinPaths, getParentDir } from '@/file/util';
import { flushSave } from '@/file/pendingSaves';

type Props = {
  dirPath: string;
  isOpen: boolean;
  handleClose: () => void;
};

export default function DirRenameModal(props: Props) {
  const { dirPath, isOpen, handleClose } = props;
  const [inputText, setInputText] = useState('');

  return (
    <BaseModal title="Rename the folder" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{dirPath}</p>
        <div className={`flex flex-col flex-1 overflow-y-auto`}>
          <input
            type="text"
            className="block py-1 mx-4 my-2 bg-base-200 border-base-300 rounded-sm"
            placeholder="Rename folder"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            autoFocus
          />
        </div>
        <button 
          className="mt-4 font-bold pop-btn" 
          onClick={async (e) => {
            e.preventDefault();
            const parentDir = await getParentDir(dirPath);
            const newDir = await joinPaths(parentDir, [inputText]);
            // the notes of the dir are moved with all their changes
            await flushSave();
            await renameFile(dirPath, newDir);
            handleClose();
          }}
        >
          Rename Folder
        </button>
      </div>
    </BaseModal>
  );
}
