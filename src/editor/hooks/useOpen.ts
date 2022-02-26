import { store } from 'lib/store';
import { 
  openDirDilog, openDir, openFile, openFileDilog, saveDilog 
} from 'file/open';
import { getDirname } from 'file/util';
import { writeAllFile } from 'file/write';

export const openFiles = async (ty: string, multi = true) => {
  cleanStore();
  const filePaths = await openFileDilog(ty, multi);
  console.log("file path", filePaths);
  const openPaths = typeof filePaths === 'string' ? [filePaths] : filePaths;
  if (openPaths.length > 0) {
    // set currentDir
    const onePath = openPaths[0];
    // const parentDirParts = onePath.split('/');
    // parentDirParts.pop();
    // const parentDir = parentDirParts.join('/');
    const parentDir = getDirname(onePath);
    console.log("dir path", parentDir);
    store.getState().setCurrentDir(parentDir);
    await openFile(openPaths, ty);
  }
};

export const onImportJson = async () => await openFiles('json', false);

export const onOpenFile = async () => await openFiles('md');

export const onOpenDir = async () => {
  cleanStore();
  const dirPath = await openDirDilog();
  console.log("dir path", dirPath);
  if (dirPath && typeof dirPath === 'string') {
    store.getState().setCurrentDir(dirPath);
    await openDir(dirPath);
  }
};

export const onSave = async () => {
  const dir = await saveDilog();
  console.log("save dir path", dir);
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
