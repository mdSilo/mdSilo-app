import type { UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri'
import { doDeleteNote } from 'editor/hooks/useDeleteNote';
import { store } from 'lib/store';
import { emitCustomEvent } from 'utils/helper';
import { openFilePaths, openJSONFilePath } from './open';
import { rmFileNameExt } from './process';
import { isTauri, normalizeSlash, joinPath, getBaseName, joinPaths } from './util';

interface SystemTime {
  nanos_since_epoch: number; // locale
  secs_since_epoch: number;
}

export interface FileMetaData {
  file_path: string;
  file_name: string;
  //file_type: string;
  file_text: string;
  created: SystemTime;
  last_modified: SystemTime;
  last_accessed: SystemTime;
  size: number;
  readonly: boolean;
  is_dir: boolean;
  is_file: boolean;
  is_hidden: boolean;
}

export interface SimpleFileMeta {
  file_name: string;
  file_path: string;
  created: SystemTime;
  last_modified: SystemTime;
  last_accessed: SystemTime;
  size: number;
  readonly: boolean;
  is_dir: boolean;
  is_file: boolean;
  is_hidden: boolean;
}

interface DirectoryData {
  files: FileMetaData[];
  number_of_files: number;
}

interface EventPayload {
  paths: string[];
  event: string;
}

interface Event {
  event: string;
  windowLabel: string;
  payload: EventPayload;
  id: number;
}

let listener: UnlistenFn;

/** Invoke Rust command to handle directory */
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
   * Get files with simple metadata, w/o content
   * @returns {Promise<DirectoryData>}
  */
  listDirectory(): Promise<SimpleFileMeta[]> {
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
   * Get files with metadata and content
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
    return await invoke(
     'file_exist', { filePath: this.dirPath}
    );
  }

  /**
   * Listen to changes event in a directory emited from backend
   * backend -1: src-tauir/src/files.rs/listen_dir 
   * backend -2: src-tauir/src/json.rs/write_json 
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
        // sync the change on listen
        const payload: EventPayload = e.payload;
        const filePaths = payload.paths; // FULL PATH
        const event = payload.event;
        // console.log("event kind: ", event);
        // console.log("file paths: ", filePaths);
        if (event === 'write' || event === 'close_write') {
          const currentNoteId = store.getState().currentNoteId;
          // console.log("write: ", event, filePaths, currentNoteId)
          // any change on current note will not be loaded 
          const wrotePaths = filePaths.filter(f => f !== currentNoteId);
          if (wrotePaths.length > 0) await openFilePaths(wrotePaths);
        } else if (event === 'renameFrom') {
          // on Linux, del is renameFrom
          const currentNoteId = store.getState().currentNoteId;
          for (const filePath of filePaths) {
            // console.log("open renamed file", filePath, event)
            // delete in store
            const baseName = await getBaseName(filePath);
            let title = baseName[0];
            const isFile = baseName[1];
            if (isFile) {
              title = rmFileNameExt(title);
            }
            await doDeleteNote(filePath, title);
            // console.log("delete note: ", res, filePath, currentNoteId);
            if (filePath === currentNoteId) {
              store.getState().setCurrentNoteId('');
            }
          }
        } else if (event === 'renameTo') {
          await openFilePaths(filePaths)
          // for (const filePath of filePaths) {
          //   const res = await openFilePaths([filePath]);
          //   console.log("open rename file", filePath, res, event)
          // }
        } else if (event === 'create') {
          // console.log("create: ", filePaths)
          // files and dir moved into a watch folder on Linux will now be reported as rename to events instead of create events
          // open, upsert 
          await openFilePaths(filePaths);
        } else if (event === 'remove') {
          // on Linux, remove event is renameFrom
          for (const filePath of filePaths) {
            store.getState().deleteNote(filePath);
            // console.log("delete file", filePath, event);
          }
        } else if (event === 'loaded') {
          // console.log("load: ", filePaths, event);
          if (!filePaths || filePaths.length < 1) return;
          // json to store 
          const dir = filePaths[0];
          const jsonPath = await joinPaths(dir, ['mdsilo.json']);
          const jsonData = await openJSONFilePath(jsonPath);
          if (jsonData) {
            store.getState().setNotes(jsonData.notesobj);
            //store.getState().setNoteTree(jsonData.notetree);
            store.getState().setIsLoaded(true);
            store.getState().setIsLoading(false);
          }
        } else if (event === 'unloaded') {
          store.getState().setIsLoaded(false);
        } else {
          // CANNOT LISTEN on load
          // console.log("custom event: ", filePaths, event);
          // TODO: to handle some event 
          emitCustomEvent(event, filePaths.pop() || "");
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
