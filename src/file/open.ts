import * as dialog from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { store } from 'lib/store';
import DirectoryAPI from './directory';
import FileAPI from './files';
import { processJson, processMds, preProcessMds } from './process';
import { writeJsonFile } from './write';

/* 
Open files: 
  process and import to store, a json storing all data will be created and saved
Open json: 
  import to store, when edit any file, a .md will be created and saved 
*/

function getRecentDirPath() {
  const recentDir = store.getState().recentDir;
  if (recentDir && Array.isArray(recentDir) && recentDir.length > 0) {
    return recentDir[recentDir.length - 1] || '.';
  } else {
    return '.';
  }
}

/**
 * Dialog to get dir path to open
 * @returns 
 */
export const openDirDilog = async () => {
  const recentDirPath = getRecentDirPath();
  const dirPath  = await dialog.open({
    title: `Open Folder`,
    directory: true,
    multiple: false,
    defaultPath: recentDirPath,
    filters: [
      {name: 'dir', extensions: ['md', 'json']}
    ],
  });
  return dirPath;
};

/**
 * Open dir and pre-process files
 * @param dir 
 * @returns 
 */
export const openDir = async (dir: string, toListen=true): Promise<void> => {
  const dirInfo = new DirectoryAPI(dir);
  // console.log("dir api", dirInfo)
  if (!(await dirInfo.exists())) return;

  // attach listener to monitor changes in dir // TODO
  if (toListen) { dirInfo.listen(() => {/*TODO*/}); }

  // 1- try process mdsilo_all.json
  const jsonInfo = new FileAPI('mdsilo_all.json', dir);
  // console.log("json", jsonInfo)
  if (await jsonInfo.exists()) {
    const fileContent = await jsonInfo.readFile();
    const jsonProcessed = processJson(fileContent);
    if (jsonProcessed) { return; }
  }
  // 2- list files if no json processed
  const files = await dirInfo.listDirectory();
  if (files.length) {
    // pre process files: get meta without content
    preProcessMds(files);
  }
  // 3- try process daily dir
  const dailyDir =  new DirectoryAPI('daily', dir);
  if (await dailyDir.exists()) {
    await openDir(dailyDir.dirPath, false);
  }
}

/**
 * dialog to get file paths to open
 * @param ty file type: md or json
 * @param multi multi-select or not
 * @returns 
 */
export const openFileDilog = async (ty: string[], multi = true) => {
  const recentDirPath = getRecentDirPath();
  const filePaths = await dialog.open({
    title: `Open ${ty} File`,
    directory: false,
    multiple: multi,
    defaultPath: recentDirPath,
    filters: [
      {
        name: 'file', 
        extensions: ty,
      }
    ],
  });
  return filePaths;
};

/**
 * Open and process files
 * @param filePaths 
 * @param ty file type: md or json
 * @returns Promise<boolean>
 */
export async function openFilePaths(filePaths: string[], ty = 'md') {
  if (ty === 'json') {
    const filePath = filePaths[0];
    if (filePath && filePath.endsWith('.json')) {
      const jsonInfo = new FileAPI(filePath);
      if (await jsonInfo.exists()) {
        const fileContent = await jsonInfo.readFile();
        return processJson(fileContent);
      }
    }
  } else {
    const files = [];
    for (const filePath of filePaths) {
      const fileInfo = new FileAPI(filePath);
      if (await fileInfo.exists()) {
        const fileMeta = await fileInfo.getMetadata();
        files.push(fileMeta);
      } 
    }
    // process files
    const processedRes = processMds(files);
    // sync store states to JSON
    if (processedRes.length > 0) {
      const currentDir = store.getState().currentDir;
      if (currentDir) { await writeJsonFile(currentDir); } 
      return true;
    }
  }
}

/**
 * open an url
 * @returns boolean, if opened
 */
export async function openUrl(url: string): Promise<boolean> {
  return await invoke<boolean>(
    'open_url', { url }
  );
}

/**
 * dialog to get dir path to save data
 * @returns 
 */
 export const saveDilog = async () => {
  const recentDirPath = getRecentDirPath();
  const dirPath = await dialog.save({
    title: 'Select Folder to Save Data',
    defaultPath: recentDirPath,
  });
  return dirPath;
};
