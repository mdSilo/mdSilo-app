import * as dialog from '@tauri-apps/api/dialog'
import { invoke } from '@tauri-apps/api/tauri'
import { store } from 'lib/store';
import DirectoryAPI from './directory';
import FileAPI from './files';
import { processJson, processMds } from './process';

/* 
Open files: 
  process and import to store, 
  when edit any file, a json storing all data will be created and saved
OPen json: 
  import to store, when edit any file, a .md will be created and saved 

TODO: 
a better way and eliminate the 'store' which is introduced from web app, but:
each file or evne some blocks are not standalone but networked
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
  console.log("default dir path: ", recentDirPath);
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
 * Open dir and process files
 * @param dir 
 * @param writeHistory 
 * @returns 
 */
export const openDir = async (dir: string, writeHistory = true): Promise<void> => {
  //
  const dirInfo = new DirectoryAPI(dir);
  console.log("dir api", dirInfo)
  if (!(await dirInfo.exists())) {
    console.log('Directory not exists');
    return;
  }

  const jsonInfo = new FileAPI('mdsilo_all.json', dir);
  console.log("json", jsonInfo)
  if (await jsonInfo.exists()) {
    // process json
    const fileContent = await jsonInfo.readFile();
    processJson(fileContent);
    return;
  }

  const files = await dirInfo.getFiles();
  const openFiles = files.files;
  if (openFiles.length) {
    // attach listener to monitor changes in dir
    dirInfo.listen(() => {/*TODO*/ console.log("listen dir change")}); // TODO
    // console.timeEnd(dir);
    // process files
    processMds(openFiles);
    return;
  }
}

/**
 * dialog to get file paths to open
 * @param ty file type: md or json
 * @param multi multi-select or not
 * @returns 
 */
export const openFileDilog = async (ty: string, multi = true) => {
  const recentDirPath = getRecentDirPath();
  const filePaths = await dialog.open({
    title: `Open ${ty} File`,
    directory: false,
    multiple: multi,
    defaultPath: recentDirPath,
    filters: [
      {
        name: 'file', 
        extensions:  ty === 'json' ? ['json'] : ty === 'md' ? ['md'] : ['md', 'json']
      }
    ],
  });
  return filePaths;
};

/**
 * Open and process files
 * @param filePaths 
 * @param ty file type: md or json
 * @param writeHistory 
 * @returns 
 */
export async function openFile(
  filePaths: string[], 
  ty = 'md', 
  writeHistory = true
) {
  if (ty === 'json') {
    const filePath = filePaths[0];
    if (filePath && filePath.endsWith('.json')) {
      const jsonInfo = new FileAPI(filePath);
      if (await jsonInfo.exists()) {
        // process json
        const fileContent = await jsonInfo.readFile();
        processJson(fileContent);
        return;
      }
    }
  } else {
    const openFiles = [];
    for (const filePath of filePaths) {
      const fileInfo = new FileAPI(filePath);
  
      if (await fileInfo.exists()) {
        // process json
        const fileMeta = await fileInfo.getMetadata();
        openFiles.push(fileMeta);
      } 
    }
    // process files
    processMds(openFiles);
    return;
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
 * dialog to get file paths to open
 * @returns 
 */
 export const saveDilog = async () => {
  const recentDirPath = getRecentDirPath();
  const dirPath = await dialog.save({
    title: 'Select Folder to Save Data',
    defaultPath: recentDirPath,
  });
  console.log('to folder', dirPath);
  return dirPath;
};
