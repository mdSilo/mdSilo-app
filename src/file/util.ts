/* eslint-disable @typescript-eslint/no-explicit-any */
import { window as appWindow } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/tauri'
import { store, NotesData } from 'lib/store';


export const isTauri = Boolean(
	typeof window !== 'undefined' 
  && window !== undefined 
  && (window as any).__TAURI__ !== undefined 
  && (window as any).promisified !== null
);

export const setWindowTitle = (title: string, inLoading?: boolean): void => {
	if (isTauri) {
    const isLoading = inLoading ?? store.getState().isLoading;
		appWindow.getCurrent().setTitle(`${title} ${isLoading ? ' --- Loading ---' : ''}`);
	}
};

/**
 * Normalize slashes of a file path, sync version
 * @param {string} path
 * @returns {string}
 */
export const normalizeSlash = (path: string): string => {
  // replace all '\' to '/'
  path = path.replace(/\\/g, '/');
  // not end with '/', consistent with rust end: paths::normalize_slash
  return trimSlash(path, 'end') || '/';
};

/**
 * Join multi path parts into a string. sync version
 * @param {string[]} ...args paths
 * @returns {string}
 */
export const joinPath = (...args: string[]): string => {
  if (args.length === 0) { return '.'; }

  let joined: string | undefined = undefined;
  for (const arg of args) {
    if (arg.length > 0) {
      if (joined === undefined) {
        joined = trimSlash(normalizeSlash(arg), 'end');
      } else {
        joined += `/${trimSlashAll(arg)}`;
      }
    }
  }
  return joined || '.';
};

/**
 * Join multi path parts to a string as path, async, invoke rust end
 * @param {string} root path root
 * @param {string[]} parts path parts
 * @returns {Promise<string>} joined path
 */
export const joinPaths = async (root: string, parts: string[]): Promise<string> => {
  return await invoke('join_paths', { root, parts });
};

/**
 * create dir 
 * @param {string} dirPath 
 * @returns {Promise<boolean>}
 */
export const createDirRecursive = async (dirPath: string): Promise<boolean> => {
  return await invoke('create_dir_recursive', { dirPath });
};

/**
 * delete dir or file
 * @param {string[]} paths 
 * @returns {Promise<boolean>}
 */
export const deleteFiles = async (paths: string[]): Promise<boolean> => {
  return await invoke('delete_files', { paths });
};

/**
 * rename dir or file
 * @param {string} fromPath 
 * @param {string} toPath 
 * @returns {Promise<boolean>}
 */
export const renameFile = async (fromPath: string, toPath: string): Promise<boolean> => {
  return await invoke('rename_file', { fromPath, toPath });
};

/**
 * Get dir path of the file path, the path must be existing on disk
 * parent dir for file, and self for dir
 * @param {string} path 
 * @returns {Promise<string>}
 */
export const getDirPath = async (path: string): Promise<string> => {
  return await invoke('get_dirpath', { path });
};

/**
 * Get parent dir path of the file/dir path
 * @param {string} path 
 * @returns {Promise<string>}
 */
export const getParentDir = async (path: string): Promise<string> => {
  return await invoke('get_parent_dir', { path });
};

/**
 * get basename of file or dir
 * @returns {Promise<[string, boolean]>} [name, is_file]
 */
export const getBaseName = async (filePath: string): Promise<[string, boolean]> => {
  return await invoke<[string, boolean]>(
    'get_basename', { filePath }
  );
}

/**
 * trim slash or backslash
 * @param txt 
 * @param mode start or end
 * @returns triemed txt
 */
function trimSlash(txt: string, mode = 'start') {
  if (mode === 'start') {
    while (txt.startsWith('/') || txt.startsWith('\\')) {
      txt = txt.substring(1);
    }
    return txt;
  } else {
    while (txt.endsWith('/') || txt.endsWith('\\')) {
      txt = txt.substring(0, txt.length - 1);
    }
    return txt;
  }
}
// export for test
export function trimSlashAll(txt: string) {
  const txt0 = trimSlash(txt);
  const txt1 = trimSlash(txt0, 'end');
  return txt1;
}

// 
export const buildNotesJson = () => {
  const isloaded = store.getState().isLoaded;
  const notesobj = store.getState().notes;
  const notetree = store.getState().noteTree;
  const activities = store.getState().activities;
  const notesData: NotesData = {isloaded, notesobj, notetree, activities};
  const notesJson = JSON.stringify(notesData);
  return notesJson;
}
