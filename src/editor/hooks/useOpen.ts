import { store } from 'lib/store';
import { 
  openDirDilog, openDir, openFile, openFileDilog, saveDilog 
} from 'file/open';
import { getDirname } from 'file/util';
import { writeAllFile } from 'file/write';

export const openFiles = async (ty: string, multi = true) => {
  const filePaths = await openFileDilog(ty, multi);
  // console.log("file path", filePaths);
  const openPaths = typeof filePaths === 'string' ? [filePaths] : filePaths;
  if (openPaths.length > 0) {
    // set currentDir
    const onePath = openPaths[0];
    const parentDir = getDirname(onePath);
    // console.log("dir path", parentDir);
    cleanStore();
    store.getState().setCurrentDir(parentDir);
    store.getState().setRecentDir([parentDir]);
    await openFile(openPaths, ty);
  }
};

export const onImportJson = async () => await openFiles('json', false);

export const onOpenFile = async () => await openFiles('md');

export const onOpenDir = async () => {
  const dirPath = await openDirDilog();
  // console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    cleanStore();
    store.getState().setCurrentDir(dirPath);
    store.getState().setRecentDir([dirPath]);
    // console.log("rencent dir path", store.getState().recentDir);
    await openDir(dirPath);
  }
};

export const onSave = async () => {
  const dir = await saveDilog();
  // console.log("save dir path", dir);
  const notesObj = store.getState().notes;
  await writeAllFile(dir, notesObj);
  store.getState().setCurrentDir(dir);
};

function cleanStore() {
  // cleaning store
  store.getState().setNoteTree([]);
  store.getState().setNotes({});
  store.getState().setOpenNoteIds([]);
  store.getState().setCurrentDir(undefined);
}
