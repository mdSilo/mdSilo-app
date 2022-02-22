import { invoke } from '@tauri-apps/api/tauri'
import { fs } from '@tauri-apps/api'
import FileMetaData from './directory';
import { isTauri, joinPath, getDirname } from './util';

/** Invoke Rust command to handle files */
class FileAPI {
  readonly fileName: string | string[];
  readonly parentDir: string | undefined;

  /**
   * Construct FileAPI Class
   * @param {string} fileName - Your file path
   * @param {string} parentDir - Parent directory of the file
   */
  constructor(fileName: string | string[], parentDir?: string) {
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
		  fs.readTextFile(this.fileName).then(
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

  async readBuffer(): Promise<Buffer> {
	const Buffer = require('buffer/').Buffer;
	return new Promise((resolve, reject) => {
	  if (typeof this.fileName === 'string') {
		if (isTauri) {
		  resolve(Buffer.from(fs.readBinaryFile(this.fileName).then(
			(fileContent) => fileContent))
		  );
		} else {
		  reject('Read file is currently not supported on web version');
		}
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
   * Read properties of a file
   * @returns {Promise<FileMetaData>}
   */
  async properties(): Promise<FileMetaData> {
	return await invoke(
	  'get_file_properties', 
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
   * Calculate total size of given file paths
   * @returns {number} - Size in bytes
  */
  async calculateFilesSize(): Promise<number> {
	return await invoke(
	  'calculate_files_total_size', 
	  { files: this.fileName }
	);
  }
}

export default FileAPI;
