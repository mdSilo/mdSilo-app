import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri'
import { getCurrent } from '@tauri-apps/api/window'
import { isTauri, normalizeSlash, joinPath } from './util';
//import { openFile } from './open';

interface SystemTime {
  nanos_since_epoch: number;
  secs_since_epoch: number;
}

export interface FileMetaData {
  file_path: string;
  file_name: string;
  //file_type: string;
  file_text: string;
  created: SystemTime;
  last_modified: SystemTime;
  last_accessed?: SystemTime;
  size?: number;
  readonly?: boolean;
  is_dir?: boolean;
  is_file?: boolean;
}

export interface SimpleFileMeta {
  file_name: string;
  file_path: string;
  created: SystemTime;
  last_modified: SystemTime;
  last_accessed?: SystemTime;
  size?: number;
  readonly?: boolean;
  is_dir?: boolean;
  is_file?: boolean;
}

interface DirectoryData {
  files: FileMetaData[];
  number_of_files: number;
}

interface EventPayload {
  path: string;
  event: string;
}

interface Event {
  event: string;
  windowLabel: string;
  payload: EventPayload;
  id: number;
}

let listener: UnlistenFn;

/**
 * Invoke Rust command to read information of a directory
 */
class DirectoryAPI {
  readonly dirPath: string;  // path
  readonly parentDir: string | undefined;
  files: FileMetaData[] | SimpleFileMeta[] | undefined;
	
  constructor(dirName: string, parentDir?: string) {
    if (parentDir) {
	    this.parentDir = normalizeSlash(parentDir);
	    this.dirPath = normalizeSlash(joinPath(parentDir, dirName));
    } else {
      this.dirPath = normalizeSlash(dirName);
    }
  }

  /**
   * Get files inside a directory
   * @returns {Promise<DirectoryData>}
  */
   listFiles(): Promise<SimpleFileMeta[]> {
    return new Promise((resolve) => {
      if (isTauri) {
        invoke<SimpleFileMeta[]>(
          'list_directory', { dir: this.dirPath }
        ).then((files: SimpleFileMeta[]) => {
          this.files = files;
          resolve(files);
        });
      }
    });
  }

  /**
   * Get files inside a directory
   * @returns {Promise<DirectoryData>}
  */
  getFiles(): Promise<DirectoryData> {
    return new Promise((resolve) => {
      if (isTauri) {
        invoke<DirectoryData>(
          'read_directory', { dir: this.dirPath }
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
          'is_dir', { path: this.dirPath }
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
   return await invoke('file_exist', { filePath: this.dirPath});
  }

  /**
   * Create dir if not exists
   * @returns {any}
   */
  async mkdir(): Promise<boolean> {
    return await invoke(
      'create_dir_recursive', 
      { dirPath: this.dirPath }
    );
  }

  /**
   * Listen to changes in a directory
   * @param {() => void} callbackFn - callback
   * @returns {any}
   */
  async listen(callbackFn: () => void): Promise<void> {
    if (isTauri) {
      // emit
      invoke('listen_dir', { dir: this.dirPath });
      // listen
      listener = await getCurrent().listen('changes', async (e: Event) => {
        console.log(e);
        // Try to sync the change on listen, but:
        // 1- still need re-entry to reload the changes;
        // 2- reduce performance much, for it also listen the changes by self
        const payload: EventPayload = e.payload;
        console.log("event payload", payload);
        // const filePath = payload.path;
        // const event = payload.event;
        // console.log("event", event)
        // if (event === 'write' || event === 'close_write') {
        //   await openFile([filePath]);
        // }
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
