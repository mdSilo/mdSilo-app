import { invoke } from '@tauri-apps/api/tauri'
import { FileMetaData } from './directory';
import { isTauri, joinPath, getDirname } from './util';

/** Invoke Rust command to handle files */
class FileAPI {
  readonly fileName: string;
  readonly parentDir: string | undefined;

  /**
   * Construct FileAPI Class
   * @param {string} fileName - Your file path
   * @param {string} parentDir - Parent directory of the file
   */
  constructor(fileName: string, parentDir?: string) {
		if (parentDir && typeof fileName === 'string') {
			this.parentDir = parentDir;
			this.fileName = joinPath(parentDir, fileName);
		} else {
			this.fileName = fileName;
		} 
  }

  /**
   * Read text file
   * @returns {Promise<any>}
   */
  readFile(): Promise<string> {
		return new Promise((resolve, reject) => {
			if (typeof this.fileName === 'string') {
				if (isTauri) {
					invoke<string>(
						'read_file', { filePath: this.fileName}
					).then(
					  (fileContent: string) => resolve(fileContent)
					);
				} else {
					reject('Read file is currently not supported on web version');
				}
			} else {
			  reject('File name is not a string');
			}
		});
  }

  /**
   * Read file and return as JSON
   * @returns {Promise<JSON>}
   */
  async readJSONFile(): Promise<JSON> {
		const content = await this.readFile();
		return JSON.parse(content);
  }

  /**
   * Return true if file exist
   * @returns {boolean}
   */
  async exists(): Promise<boolean> {
		return await invoke<boolean>(
			'file_exist', 
			{ filePath: this.fileName }
		);
  }

	/**
   * Read metadata of a file
   * @returns {Promise<FileMetaData>}
   */
	 async getMetadata(): Promise<FileMetaData> {
		return await invoke<FileMetaData>(
			'get_file_meta', 
			{ filePath: this.fileName }
		);
  }

  /**
   * Check if given path is directory
   * @returns {Promise<boolean>}
   */
  async isDir(): Promise<boolean> {
		return new Promise((resolve) => {
			invoke<boolean>('is_dir', { path: this.fileName }).then(
			  (result: boolean) => resolve(result)
			);
		});
  }

  /**
   * Create file if it doesn't exist
   * @returns {Promise<void>}
   */
  async createFile(): Promise<void> {
		if (typeof this.fileName === 'string') {
			if (isTauri) {
				await invoke('create_dir_recursive', {
					dirPath: getDirname(this.fileName),
				});
				return await invoke('create_file', { filePath: this.fileName });
			} else {
				return;
			}
		}
  }

	/**
   * write to file
   * @returns {Promise<void>}
   */
	 async writeFile(text: string): Promise<void> {
		if (typeof this.fileName === 'string') {
			if (isTauri) {
				await invoke('create_dir_recursive', {
					dirPath: getDirname(this.fileName),
				});
				return await invoke('write_file', { filePath: this.fileName, text });
			} else {
				return;
			}
		}
  }

  /**
	 * delete file
	 * @returns boolean, if deleted
	 */
  async deleteFiles(): Promise<boolean> {
		return await invoke<boolean>(
			'delete_files', 
			{ paths: [this.fileName] }
		);
  }
}

export default FileAPI;
