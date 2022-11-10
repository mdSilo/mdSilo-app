import { store } from 'lib/store';
import { 
  openDirDilog, openDir, listDir, openFilePaths, openFileDilog, saveDilog, loadDir, openJSONFilePath 
} from 'file/open';
import { normalizeSlash, getDirPath, getBaseName, joinPaths } from 'file/util';
import { writeAllFile, writeFile } from 'file/write';
import { rmFileNameExt } from 'file/process';

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

export const openJsonFile = async () => {
  const onePath = await openFileDilog(['json'], false);
  // console.log("json file path", onePath, typeof onePath);
  if (onePath && typeof onePath === 'string') {
    // workflow: 
    // 0- open json file
    const jsonData = await openJSONFilePath(onePath);
    // console.log('json data: ', jsonData);
    if (jsonData) {
      // 1- build a folder to save markdown files 
      const parentDir = await getDirPath(onePath);
      const jsonName = (await getBaseName(onePath))[0];
      const dirName = await joinPaths(parentDir, [rmFileNameExt(jsonName)]);
      // 2- json to markdown files and save 
      const notes = Object.values(jsonData.notesobj);
      for (const note of notes) {
        const title = note.title;
        const content = note.content;
        const filePath =  await joinPaths(dirName, [`${title}.md`]);
        await writeFile(filePath, content);
      }
      // 3- open that folder 
      await listInitDir(dirName);
    }
  }
};

export const onSave = async () => {
  const dir = await saveDilog('mdsiloFolder');
  if (!dir) return;
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
