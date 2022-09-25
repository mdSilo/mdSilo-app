import { useState } from 'react';
import { BaseModal } from 'components/settings/BaseModal';
import { createDirRecursive, joinPaths } from 'file/util';

type Props = {
  dirPath: string;
  isOpen: boolean;
  handleClose: () => void;
};

export default function DirNewModal(props: Props) {
  const { dirPath, isOpen, handleClose } = props;
  const [inputText, setInputText] = useState('');

  return (
    <BaseModal title="Create New Subfolder" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{dirPath}</p>
        <div className={`flex flex-col flex-1 overflow-y-auto`}>
          <input
            type="text"
            className="block py-1 mx-4 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
            placeholder="New subfolder name"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            autoFocus
          />
        </div>
        <button 
          className="mt-4 font-bold pop-btn" 
          onClick={async (e) => {
            e.preventDefault();
            const newDir = await joinPaths(dirPath, [inputText]);
            await createDirRecursive(newDir);
          }}
        >
          Create Subfolder
        </button>
      </div>
    </BaseModal>
  );
}
