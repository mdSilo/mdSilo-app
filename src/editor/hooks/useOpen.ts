import { store } from 'lib/store';
import { 
  openDirDilog, openDir, listDir, openFilePaths, openFileDilog, saveDilog, loadDir 
} from 'file/open';
import { normalizeSlash, getDirPath } from 'file/util';
import { writeAllFile } from 'file/write';

const openFiles = async (multi = true) => {
  const filePaths = await openFileDilog(['md'], multi);
  // console.log("file path", filePaths);
  const openPaths = typeof filePaths === 'string' ? [filePaths] : filePaths;
  if (openPaths && openPaths.length > 0) {
    const onePath = openPaths[0];
    const parentDir = await getDirPath(onePath);
    // console.log("dir path", parentDir);
    cleanStore();
    store.getState().setCurrentDir(parentDir);
    store.getState().upsertRecentDir(parentDir);
    await openFilePaths(openPaths);
  }
};

export const onOpenFile = async () => await openFiles();

export const onOpenDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    store.getState().setInitDir(normalizedDir);
    store.getState().setCurrentDir(normalizedDir);
    store.getState().upsertRecentDir(normalizedDir);
    // console.log("rencent dir path", store.getState().recentDir);
    await openDir(normalizedDir);
  }
};

// used for list init dir: 
// SidebarNotes init Open Folder,
// File Drop(SidebarNotesBar Dropdown-Folder, SideMenu/FileButton Dropdown-Folder)
export const onListDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    cleanStore();
    const normalizedDir = await getDirPath(dirPath);
    // console.log("rencent dir path", store.getState().recentDir);
    await listInitDir(normalizedDir);
  }
};

// use for list init dir
// onListDir 
// SidebarHistory, to recent dir 
export const listInitDir = async (dirPath: string) => {
  store.getState().setInitDir(dirPath);
  store.getState().setCurrentDir(dirPath);
  store.getState().upsertRecentDir(dirPath);
  // listen on init dir only
  await listDir(dirPath);
  // load dir/sub-dirs to json on rust end 
  loadDir(dirPath);
};

// use for list sub-dir: 
// SidebarNoteLink, to sub-dir
// SidebarNotesBar, to upper-dir
export const listDirPath = async (dirPath: string, noCache = true) => {
  // console.log("dir path", dirPath);
  const normalizedDir = await getDirPath(dirPath);
  store.getState().setCurrentDir(normalizedDir);
  if (noCache) {
    store.getState().setNoteTree({});
    // console.log("rencent dir path", store.getState().recentDir);
    await listDir(normalizedDir, false);
  } else {
    const itemList = store.getState().noteTree[normalizedDir];
    if (!itemList)  {
      await listDir(normalizedDir, false);
    }
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
  // cleaning store, *first tree then notes*
  store.getState().setNoteTree({});
  store.getState().setNotes({});
  store.getState().setCurrentDir(undefined);
  store.getState().setCurrentNoteId('');
  store.getState().setIsLoaded(false);
  store.getState().setIsLoading(false);
}
