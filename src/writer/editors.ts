import type MsEditor from "mdsmirror";

/**
 * The editors (WYSIWYG) of the notes shown, by note id: for plugins to act
 * on the note open (see plugins/editorApi.ts). One per note.
 */
const editors = new Map<string, MsEditor>();

/** The editor of the note shows, or is gone (null) */
export function setEditor(noteId: string, editor: MsEditor | null) {
  if (editor) editors.set(noteId, editor);
  else editors.delete(noteId);
}

/** The editor of the note, if it shows in the WYSIWYG mode */
export const editorOf = (noteId: string): MsEditor | undefined =>
  editors.get(noteId);
