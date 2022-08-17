import { store, Notes, NoteTreeItem, NotesData } from 'lib/store';
import { regDateStr } from 'utils/helper';
import { Note, defaultNote } from 'types/model';
import { FileMetaData } from 'file/directory';

export function processJson(content: string): boolean {
  try {
    const notesData: NotesData = JSON.parse(content);
    const notesObj: Notes = notesData.notesObj;
    const noteTree: NoteTreeItem[] = notesData.noteTree;
    if (notesObj && noteTree) {
      // restore notes from saved data 
      store.getState().setNotes(notesObj);
      // restore note tree from saved tree hierarchy
      store.getState().setNoteTree(noteTree);
      // TODO: json to mds and save locally
      return true;
    } else {
      return false;
    }
  } catch (e) {
    store.getState().setMsgModalText('Please Check the JSON file');
    store.getState().setMsgModalOpen(true);
    return false;
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
    // Issue Alert: same title but diff ext, only one file can be imported
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
const rmFileNameExt = (fname: string) => {
  return fname.replace(/\.[^/.]+$/, '');
}

const checkFileIsMd = (fname: string) => {
  const check = /\.(text|txt|md|mkdn|mdwn|mdown|markdown){1}$/i.test(fname);
  return check;
}
