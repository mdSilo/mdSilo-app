import * as dialog from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { Notes, store } from 'lib/store';
import { defaultNote, Note } from 'types/model';
import DirectoryAPI from './directory';
import FileAPI from './files';
import { processJson, processFiles, processDirs } from './process';
import { getParentDir, getBaseName, joinPaths } from './util';

/* 
Open files: 
  process and import to store, a json storing all data will be created and saved
Open json: 
  import to store, when edit any file, a .md will be created and saved 
*/

export function getRecentDirPath() {
  const recentDir = store.getState().recentDir;
  if (recentDir && Array.isArray(recentDir) && recentDir.length > 0) {
    return recentDir[recentDir.length - 1] || '';
  } else {
    return '';
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
 * Open dir and process files w/o content, upsert note and tree to store
 * @param dir 
 * @returns 
 */
export const listDir = async (dir: string, toListen=true): Promise<void> => {
  const dirInfo = new DirectoryAPI(dir);
  // console.log("dir api", dirInfo)
  if (!(await dirInfo.exists())) return;

  // attach listener to monitor changes in dir 
  if (toListen) { dirInfo.listen(() => {/*TODO*/}); }

  // 1- get files and dirs
  const dirData = await dirInfo.listDirectory();
  // console.log("dir data 0", dirData);
  const files = dirData.filter(f => !f.is_hidden);

  const dirs = files.filter(f => f.is_dir).map(d => ({...d, file_text: ''}));
  const processedDirs = dirs.length ? processDirs(dirs) : [];
  const mds = files.filter(f => f.is_file).map(d => ({...d, file_text: ''}));
  const processeds =  mds.length ? processFiles(mds) : [[], []];
  const processedMds = processeds[0];

  const upsertNote = store.getState().upsertNote;
  const upsertTree = store.getState().upsertTree;
  const dirPath = dirInfo.dirPath;
  // console.log("dir path 0", dirPath, dir);
  const treeItemList: Note[] = [];
  // 2- upsert store dirs
  for (const subdir of processedDirs) {
    const subDir =  new DirectoryAPI(subdir.file_path);
    if (await subDir.exists()) {
      // console.log("dir path1", dirPath, dir);
      treeItemList.push(subdir);
      upsertNote(subdir); 
    }
  }
  // 3- upsert store md files
  for (const md of processedMds) {
    // console.log("dir path2", dirPath, dir);
    treeItemList.push(md);
    upsertNote(md);
  }

  // 4- push non-md to tree
  const processedNons = processeds[1];
  // console.log("non", processedNons)
  for (const non of processedNons) {
    if (non.id.toLowerCase().endsWith('.json')) {
      continue;
    }
    treeItemList.push(non);
  }
 
  // 5- upsertTree
  upsertTree(dirPath, treeItemList);

  // console.log("dir path", dirPath, dir, store.getState().noteTree);
}

/**
 * Open dir and process files, upsert note and tree to store
 * @param dir 
 * @returns 
 */
export const openDir = async (dir: string, toListen=true): Promise<void> => {
  const dirInfo = new DirectoryAPI(dir);
  // console.log("dir api", dirInfo)
  if (!(await dirInfo.exists())) return;

  // attach listener to monitor changes in dir // TODO
  if (toListen) { dirInfo.listen(() => {/*TODO*/}); }

  // 1- get files and dirs
  const dirData = await dirInfo.getFiles();
  const files = dirData.files.filter(f => !f.is_hidden);

  const dirs = files.filter(f => f.is_dir);
  const processedDirs = dirs.length ? processDirs(dirs) : [];
  const mds = files.filter(f => f.is_file);
  const processeds =  mds.length ? processFiles(mds) : [[], []];
  const processedMds = processeds[0];

  const upsertNote = store.getState().upsertNote;
  const upsertTree = store.getState().upsertTree;
  const dirPath = dirInfo.dirPath;
  const treeItemList: Note[] = [];
  // 2- upsert store dirs
  for (const subdir of processedDirs) {
    const subDir =  new DirectoryAPI(subdir.file_path);
    if (await subDir.exists()) {
      // console.log("dir path1", dirPath, dir);
      treeItemList.push(subdir);
      upsertNote(subdir);
    }
  }
  // 3- upsert store md files
  for (const md of processedMds) {
    // console.log("dir path2", dirPath, dir);
    treeItemList.push(md);
    upsertNote(md);
  }
  // 4- push non-md to tree
  const processedNons = processeds[1];
  // console.log("non", processedNons)
  for (const non of processedNons) {
    if (non.id.toLowerCase().endsWith('.json')) {
      continue;
    }
    treeItemList.push(non);
  }
  // 5- upsertTree
  upsertTree(dirPath, treeItemList);
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
 * Open and process files or dirs, upsert note and tree to store
 * @param filePaths 
 * @returns Promise<boolean>
 */
export async function openFilePaths(filePaths: string[]) {
  const files = [];
  const dirs = [];

  for (const filePath of filePaths) {
    const fileInfo = new FileAPI(filePath);
    if (await fileInfo.exists()) {
      const fileMeta = await fileInfo.getMetadata();
      if (fileMeta.is_file) {
        files.push(fileMeta);
      } else {
        dirs.push(fileMeta);
      }
    }
  }

  const upsertNote = store.getState().upsertNote;
  const upsertTree = store.getState().upsertTree;
  // The filePaths maybe not in same dir(even though it is same in most cases), 
  // so need to upsertTree in the for-loop
  // process md files
  const processeds = processFiles(files);
  const processedNotes = processeds[0];
  for (const md of processedNotes) {
    upsertNote(md);
    const parentDir = await getParentDir(md.file_path);
    upsertTree(parentDir, [md]);
    upsertTreeRecursively(parentDir);
  }
  // process non-md files
  const processedNons = processeds[1];
  for (const non of processedNons) {
    if (non.id.toLowerCase().endsWith('.json')) {
      continue;
    }
    const parentDir = await getParentDir(non.id);
    upsertTree(parentDir, [non]);
    upsertTreeRecursively(parentDir);
  }
  // process dirs
  const processedDirs = processDirs(dirs);
  for (const dir of processedDirs) {
    upsertNote(dir);
    const parentDir = await getParentDir(dir.file_path);
    upsertTree(parentDir, [dir]);
    upsertTreeRecursively(parentDir);
  }
  
  return processedNotes.length > 0 || processedDirs.length > 0;
}

// openFile, use case:
// always reload file. there are 7 to open note: 
//    inline note link,
//    onNoteLinkClick(side note list, backlink)
//    graph view, 
//    when switch mode, 
//    sum list(chronicle)
//    journal

/**
 * Open and process md file or dir
 * @param filePath
 * @returns Promise<Note | undefined>
 */
export async function openFilePath(filePath: string, setCurrent: boolean) {
  const files = [];
  const dirs = [];

  const fileInfo = new FileAPI(filePath);
  if (await fileInfo.exists()) {
    const fileMeta = await fileInfo.getMetadata();
    if (fileMeta.is_file) {
      files.push(fileMeta);
    } else {
      dirs.push(fileMeta);
    }
  } else {
    return;
  }
  
  // process files
  const processedNotes = processFiles(files)[0];
  // process dirs
  const processedDirs = processDirs(dirs);
  const note = [...processedDirs, ...processedNotes][0];
  if (note) {
    store.getState().upsertNote(note);
    const parentDir = await getParentDir(note.file_path);
    store.getState().upsertTree(parentDir, [note]);
    upsertTreeRecursively(parentDir);
    if (setCurrent) {
      const cNote: Notes = {};
      cNote[note.id] = note;
      store.getState().setCurrentNote(cNote);
    }
  }

  return note;
}

/**
 * upsert dir to Tree Recursively till initDir
 * @param dirPath 
 * @returns 
 */
async function upsertTreeRecursively(dirPath: string) {
  const initDir = store.getState().initDir;
  if (!initDir || !dirPath.startsWith(initDir) || dirPath === initDir) return;

  // const noteTree = store.getState().noteTree;
  // if (noteTree[dirPath]) return;

  const dirName = (await getBaseName(dirPath))[0]; 
  if (!dirName.trim()) return;

  const newDir: Note = { 
    ...defaultNote, 
    id: dirPath, 
    title: dirName,
    file_path: dirPath,
    is_dir: true,
  };
  
  const upsertTree = store.getState().upsertTree; 
  const parentDir = await getParentDir(dirPath);
  upsertTree(parentDir, [newDir]);
  // then recursively
  upsertTreeRecursively(parentDir);
  
  return true;
}

/**
 * Open and process JSON
 * @param filePath
 * @returns Promise<boolean>
 */
export async function openJSONFilePath(filePath: string) {
  if (filePath) {
    const jsonInfo = new FileAPI(filePath);
    if (await jsonInfo.exists()) {
      const fileContent = await jsonInfo.readFile();
      const notesData = processJson(fileContent);
      return notesData;
    }
  }
}


// to load all with content, use case: 
// view(chronicle, graph); 
// search text: useNoteSearch  
// NoteMoveToInput: search dir to move to, so need to upsert dir to notes 
// backlinks(useBacklinks, updateBacklinks)

/**
 * load dir / sub-dirs and write to json on rust end 
 * @returns void 
 */
export async function loadDir(dir: string) {
  const isLoading = store.getState().isLoading;
  if (isLoading) return;
  invoke<boolean>('write_json', { dir });
  // console.log("trigger loadDir", dir, isLoading);
  store.getState().setIsLoading(true);
}

/**
 * open an url
 * @returns boolean, if opened
 */
export async function openUrl(url: string): Promise<boolean> {
  return await invoke<boolean>('open_url', { url });
}

/**
 * dialog to get dir path to save data
 *  @param fname string, optional 
 * @returns 
 */
export const saveDilog = async (fname?: string) => {
  const recentDirPath = getRecentDirPath();
  const saveToPath = fname 
    ? await joinPaths(recentDirPath, [fname]) 
    : recentDirPath;
  const dirPath = await dialog.save({
    title: 'Select Folder to Save Data',
    defaultPath: saveToPath,
  });
  return dirPath;
};
