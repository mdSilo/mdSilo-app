import { store } from 'lib/store';
import { 
  openDirDilog, openDir, listDir, openFilePaths, openFileDilog, saveDilog 
} from 'file/open';
import { normalizeSlash, getDirPath } from 'file/util';
import { writeAllFile } from 'file/write';

export const openFiles = async (ty: string, multi = true) => {
  const filePaths = await openFileDilog([ty], multi);
  // console.log("file path", filePaths);
  const openPaths = typeof filePaths === 'string' ? [filePaths] : filePaths;
  if (openPaths && openPaths.length > 0) {
    // set currentDir
    const onePath = openPaths[0];
    const parentDir = await getDirPath(onePath);
    // console.log("dir path", parentDir);
    cleanStore();
    store.getState().setCurrentDir(parentDir);
    store.getState().setRecentDir([parentDir]);
    await openFilePaths(openPaths, ty);
  }
};

export const onImportJson = async () => await openFiles('json', false);

export const onOpenFile = async () => await openFiles('md');

export const onOpenDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    store.getState().setCurrentDir(normalizedDir);
    store.getState().setRecentDir([normalizedDir]);
    // console.log("rencent dir path", store.getState().recentDir);
    await openDir(normalizedDir);
  }
};

// Open Folder, Folder in Dropdown, sub-folder, Sidemenu-File Menu
export const onListDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    store.getState().setCurrentDir(normalizedDir);
    store.getState().setRecentDir([normalizedDir]);
    // console.log("rencent dir path", store.getState().recentDir);
    await listDir(normalizedDir);
  }
};

export const onSave = async () => {
  const dir = await saveDilog();
  const normalizedDir = normalizeSlash(dir);
  // console.log("save dir path", dir, normalizedDir);
  const notesObj = store.getState().notes;
  await writeAllFile(normalizedDir, notesObj);
  store.getState().setCurrentDir(normalizedDir);
};

function cleanStore() {
  // cleaning store
  store.getState().setNoteTree([]);
  store.getState().setNotes({});
  store.getState().setCurrentDir(undefined);
}
