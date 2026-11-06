import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BaseModal } from "@/ui/BaseModal";
import { renameFile, joinPaths, getParentDir } from "@/workspace/util";
import { flushSave } from "@/workspace/pendingSaves";

type Props = {
  dirPath: string;
  isOpen: boolean;
  handleClose: () => void;
};

/** Why the new name can not be used, if so: a name only, not a path */
export const invalidDirName = (name: string): string | undefined => {
  if (!name) return "Enter a folder name";
  if (/[/\\]/.test(name)) return "A folder name can not contain / or \\";
  if (name === "." || name === "..") return "Not a valid folder name";
  return undefined;
};

export default function DirRenameModal(props: Props) {
  const { dirPath, isOpen, handleClose } = props;
  const [inputText, setInputText] = useState("");
  const [error, setError] = useState("");

  const onRename = async () => {
    const name = inputText.trim();
    const invalid = invalidDirName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    const parentDir = await getParentDir(dirPath);
    const newDir = await joinPaths(parentDir, [name]);
    if (newDir === dirPath) {
      handleClose();
      return;
    }
    // never over an existing file or dir, an empty dir would be replaced
    if (await invoke<boolean>("file_exist", { filePath: newDir })) {
      setError(`${name} already exists`);
      return;
    }
    // the notes of the dir are moved with all their changes
    await flushSave();
    if (!(await renameFile(dirPath, newDir))) {
      setError("Failed to rename the folder");
      return;
    }
    handleClose();
  };

  return (
    <BaseModal
      title="Rename the folder"
      isOpen={isOpen}
      handleClose={handleClose}
    >
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{dirPath}</p>
        <div className={`flex flex-col flex-1 overflow-y-auto`}>
          <input
            type="text"
            className="block py-1 mx-4 my-2 bg-base-200 border-base-300 rounded-sm"
            placeholder="Rename folder"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              setError("");
            }}
            autoFocus
          />
          {error ? <p className="mx-4 text-xs text-error">{error}</p> : null}
        </div>
        <button
          className="mt-4 font-bold pop-btn"
          onClick={(e) => {
            e.preventDefault();
            void onRename();
          }}
        >
          Rename Folder
        </button>
      </div>
    </BaseModal>
  );
}
