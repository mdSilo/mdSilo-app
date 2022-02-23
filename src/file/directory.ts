import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri'
import { getCurrent } from '@tauri-apps/api/window'
import { isTauri, normalizeSlash, joinPath } from './util';

interface SystemTime {
  nanos_since_epoch: number;
  secs_since_epoch: number;
}

interface FileMetaData {
  file_path: string;
  file_name: string;
  //file_type: string;
  file_text: string;
  size?: number;
  readonly?: boolean;
  is_dir?: boolean;
  is_file?: boolean;
  last_modified?: SystemTime;
  last_accessed?: SystemTime;
  created?: SystemTime;
}

interface DirectoryData {
  files: FileMetaData[];
  number_of_files: number;
}

let listener: UnlistenFn;

/**
 * Invoke Rust command to read information of a directory
 */
class DirectoryAPI {
  readonly dirName: string;
  readonly parentDir: string | undefined;
  files: FileMetaData[] | undefined;
	
  constructor(dirName: string, parentDir?: string) {
    if (parentDir) {
	    this.parentDir = normalizeSlash(parentDir);
	    this.dirName = normalizeSlash(joinPath(parentDir, dirName));
    } else {
      this.dirName = normalizeSlash(dirName);
    }
  }

  /**
   * Get files inside a directory
   * @returns {Promise<DirectoryData>}
  */
  getFiles(): Promise<DirectoryData> {
    return new Promise((resolve) => {
      if (isTauri) {
        invoke<DirectoryData>(
          'read_directory', { dir: this.dirName }
        ).then((files: DirectoryData) => {
          this.files = files.files;
          resolve(files);
        });
      }
    });
  }

  /**
   * Check if given path is directory
   * @returns {Promise<boolean>}
  */
  async isDir(): Promise<boolean> {
    return new Promise((resolve) => {
      if (isTauri) {
        invoke<boolean>(
          'is_dir', { path: this.dirName }
        ).then(
          (result: boolean) => resolve(result)
        );
      }
    });
  }

  /**
   * Return true if folder exist
   * @returns {boolean}
  */
  async exists(): Promise<boolean> {
   return await invoke('file_exist', { filePath: this.dirName });
  }

  /**
   * Create dir if not exists
   * @returns {any}
   */
  async mkdir(): Promise<boolean> {
    return await invoke(
      'create_dir_recursive', 
      { dirPath: this.dirName, }
    );
  }

  /**
   * Listen to changes in a directory
   * @param {() => void} callbackFn - callback
   * @returns {any}
   */
  async listen(callbackFn: () => void): Promise<void> {
    if (isTauri) {
      invoke('listen_dir', { dir: this.dirName });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      listener = await getCurrent().listen('changes', (e: any) => {
        console.log(e);
        callbackFn();
      });
    }
  }

  /**
   * Unlisten to previous listener
   * @returns {Promise<void>}
  */
  async unlisten(): Promise<void> {
    listener?.();
    return getCurrent().emit('unlisten_dir');
  }
}

export default DirectoryAPI;
