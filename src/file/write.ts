import { buildNotesJson } from 'components/note/NoteExport';
import FileAPI from './files';

export async function writeFile(filePath: string, content: string) {
  const file = new FileAPI(filePath);
  console.log("md file", file)
  await file.writeFile(content);
}

export async function writeJsonFile(parentDir: string, json = '') {
  const jsonFile = new FileAPI('mdSilo_all.json', parentDir);
  console.log("json file", jsonFile)
  const notesJson = json || buildNotesJson(true);
  await jsonFile.writeFile(notesJson);
}

export async function deleteFile(filePath: string) {
  const file = new FileAPI(filePath);
  await file.deleteFiles();
}
