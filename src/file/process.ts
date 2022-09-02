import { NotesData } from 'lib/store';
import { regDateStr } from 'utils/helper';
import { Note, defaultNote } from 'types/model';
import { FileMetaData } from 'file/directory';

export function processJson(content: string): NotesData {
  try {
    const notesData: NotesData = JSON.parse(content);
    return notesData;
  } catch (e) {
    // console.log('Please Check the JSON file: ', e);
    return {isLoaded: false, notesObj: {}, noteTree: {}};
  }
}

/**
 * on Process Mds: 
 */
export function processMds(fileList: FileMetaData[]) {
  const newNotesData: Note[] = [];

  for (const file of fileList) {
    const fileName = file.file_name;
    const checkMd = checkFileIsMd(fileName);
    if (!fileName || !file.is_file || !checkMd) {
      continue;
    }
    const fileContent = file.file_text;
    const filePath = file.file_path;

    // new note from file
    const newNoteTitle = rmFileNameExt(fileName);
    const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
    const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
    const isDaily = regDateStr.test(newNoteTitle);
    const newNoteObj = {
      id: filePath,
      title: newNoteTitle,
      content: fileContent,
      created_at: createdDate,
      updated_at: lastModDate,
      is_daily: isDaily,
      not_process: false,
      file_path: filePath,
    };
    const newProcessedNote = {...defaultNote, ...newNoteObj};

    // push to Array
    newNotesData.push(newProcessedNote);
  }

  return newNotesData;
}

export function processDirs(fileList: FileMetaData[]) {
  const newDirsData: Note[] = [];

  for (const file of fileList) {
    const fileName = file.file_name;
    
    if (!fileName || !file.is_dir ) {
      continue;
    }

    const filePath = file.file_path;
    const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
    const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
    const newDirObj = {
      id: filePath,
      title: fileName,
      created_at: createdDate,
      updated_at: lastModDate,
      file_path: filePath,
      is_dir: true,
    };
    const newProcessedDir = {...defaultNote, ...newDirObj};

    // push to Array
    newDirsData.push(newProcessedDir);
  }

  return newDirsData;
}

/* #endregion: import process */

/**
 * remove file name extension
 *
 * @param {string} fname, file name.
 */
export const rmFileNameExt = (fname: string) => {
  return fname.replace(/\.[^/.]+$/, '');
}

export const getFileExt = (fname: string) => {
  return fname.slice((fname.lastIndexOf(".") - 1 >>> 0) + 2);
}

const checkFileIsMd = (fname: string) => {
  const check = /\.(text|txt|md|mkdn|mdwn|mdown|markdown){1}$/i.test(fname);
  return check;
}
