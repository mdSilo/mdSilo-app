import { useCallback } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
//import { openFilePath } from 'file/open';
import FileAPI from 'file/files';
import { checkFileIsMd, rmFileNameExt } from 'file/process';
import { regDateStr } from 'utils/helper';
import { defaultNote } from 'types/model';
import { Notes, store } from 'lib/store';

export default function useOnNoteLinkClick() {
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const onClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toId: string, highlightedPath?: any) => {
      const note = await openFile(toId, true);
      if (!note) return;
      const noteId = note.id;
      const hash = highlightedPath ? `0-${highlightedPath}` : ''; // TODO
      dispatch({view: 'md', params: {noteId, hash}});
      return;
    },
    [dispatch]
  );

  return { onClick };
}

/**
 * Open and process md file
 * @param filePath
 * @returns Promise<Note | undefined>
 */
export async function openFile(filePath: string, setCurrent: boolean) {
  const fileInfo = new FileAPI(filePath);
  if (await fileInfo.exists()) {
    const file = await fileInfo.getMetadata();
    if (file.is_file) {
      const fileName = file.file_name;
    
      if (!fileName || !file.is_file) {
        return;
      }
      const fileContent = file.file_text;
      const filePath = file.file_path;

      const checkMd = checkFileIsMd(fileName);
      // new note from file
      const newNoteTitle = checkMd ? rmFileNameExt(fileName) : fileName;
      const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
      const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
      const isDaily = checkMd ? regDateStr.test(newNoteTitle) : false;
      const newNoteObj = {
        id: filePath,
        title: newNoteTitle,
        content: fileContent,
        created_at: createdDate,
        updated_at: lastModDate,
        is_daily: isDaily,
        file_path: filePath,
      };
      const note = {...defaultNote, ...newNoteObj};
      if (setCurrent) {
        const cNote: Notes = {};
        cNote[note.id] = note;
        store.getState().setCurrentNote(cNote);
      }
      return note;
    } 
  } else {
    return;
  }
}
