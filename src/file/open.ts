import * as dialog from '@tauri-apps/api/dialog'
import DirectoryAPI from './directory';
import FileAPI from './files';
import { processJson, processMds } from './process';

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
  console.log("dir api", dirInfo)
  if (!(await dirInfo.exists())) {
    console.log('Directory not exists');
    return;
  }

  const jsonInfo = new FileAPI('mdSilo_all.json', dir);
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
    console.timeEnd(dir);
    // process files
    processMds(openFiles);
    return;
  }
}
