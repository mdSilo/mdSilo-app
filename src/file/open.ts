import * as dialog from '@tauri-apps/api/dialog'
import DirectoryAPI from './directory';
//import FileAPI from './files';

export const openDirDilog = async () => {
  const dirPath  = await dialog.open({
    directory: true,
    multiple: false,
    filters: [
      {name: 'dir', extensions: ['md', 'json']}
    ],
  });
  return dirPath;
};

export const openDir = async (dir: string, writeHistory = true): Promise<void> => {
  //
  const dirInfo = new DirectoryAPI(dir);
  if (!(await dirInfo.exists())) {
    console.log('Directory not exists');
    return;
  }
  const files = await dirInfo.getFiles();
  if (files.files.length) {
    // process files
   
    // attach listener to monitor changes in dir
    dirInfo.listen(() => {/*TODO*/}); // TODO
    console.timeEnd(dir);
    return;
  }
}
