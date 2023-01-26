// import { invoke } from '@tauri-apps/api';
import { Notes } from 'lib/store';
import { buildNotesJson, joinPaths } from './util';
import FileAPI from './files';

/**
 * Write file to disk
 * @param filePath 
 * @param content 
 */
export async function writeFile(filePath: string, content: string) {
  const file = new FileAPI(filePath);
  await file.writeFile(content);
}

/**
 * Write json containing all data to folder
 * @param parentDir 
 * @param json optional
 */
export async function writeJsonFile(parentDir: string, json = '') {
  const jsonFile = new FileAPI('mdsilo.json', parentDir);
  const notesJson = json || buildNotesJson();
  await jsonFile.writeFile(notesJson);
  // await invoke('save_notes', { dir: parentDir, content: notesJson });
}

/**
 * Delete a file
 * @param filePath string
 */
export async function deleteFile(filePath: string) {
  const file = new FileAPI(filePath);
  await file.deleteFiles();
}

/**
 * save all mds and json to a folder
 * @param dirPath string
 */
export async function writeAllFile(dirPath: string, notesObj: Notes) {
  // save mds
  const myNotes = Object.values(notesObj);
  for (const note of myNotes) {
    const fileName = `${note.title}.md`;
    const notePath = await joinPaths(dirPath, [fileName]);
    const content = note.content;
    await writeFile(notePath, content);
  }
  // save json with all notes, data
  const notesJson = buildNotesJson();
  await writeJsonFile(dirPath, notesJson);
}
