import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri'
import { store } from 'lib/store';
import { isTauri, normalizeSlash, joinPath } from './util';

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

  // TODO: listen dir changes
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
      const { getCurrent } = await import('@tauri-apps/api/window');
      listener = await getCurrent().listen('changes', async (e: Event) => {
        // console.log("listen event: ", e);
        // sync the change on listen, set not_process false, but:
        // need re-entry to reload the changes;
        const payload: EventPayload = e.payload;
        const filePath = payload.path;
        const event = payload.event;
        // console.log("event: ", event);
        // console.log("file path: ", filePath);
        if (event === 'write' || event === 'close_write') {
          const notesArr = Object.values(store.getState().notes);
          for (const note of notesArr) {
            if (note.file_path === filePath) {
              const currentNoteId = store.getState().currentNoteId;
              // console.log("note current ids: ", note.id, currentNoteId)
              // any change on current note will not be loaded
              if (note.id !== currentNoteId) {
                store.getState().updateNote({
                  id: note.id,
                  not_process: true,
                });
                // console.log("updated not_process!");
              }
              break;
            }
          }
        }
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
    const { getCurrent } = await import('@tauri-apps/api/window');
    return getCurrent().emit('unlisten_dir');
  }
}

export default DirectoryAPI;
