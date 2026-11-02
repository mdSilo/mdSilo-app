import { invoke } from "@tauri-apps/api/core";
import type { NoteMap } from "@/state/store";
import { buildNotesJson, joinPaths } from "./util";
import FileAPI from "./files";

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
export async function writeJsonFile(parentDir: string, json = "") {
  const jsonFile = new FileAPI("mdsilo.json", parentDir);
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
export async function writeAllFile(dirPath: string, notes: NoteMap) {
  // save mds: the ones loaded as they are, the others (see Note.parsed)
  // copied from disk in Rust, not read here
  for (const note of notes.values()) {
    if (note.is_dir) continue;
    const notePath = await joinPaths(dirPath, [`${note.title}.md`]);
    if (note.parsed)
      await invoke("copy_file", { srcPath: note.id, toPath: notePath });
    else await writeFile(notePath, note.content);
  }
  // save json with all notes, data
  const notesJson = buildNotesJson();
  await writeJsonFile(dirPath, notesJson);
}
