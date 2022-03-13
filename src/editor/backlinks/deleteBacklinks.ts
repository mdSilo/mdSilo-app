import { createEditor, Editor, Element, Transforms } from 'slate';
import { ElementType } from 'editor/slate';
import { Note } from 'types/model';
import { store } from 'lib/store';
import { writeJsonFile } from 'file/write';
import { computeLinkedBacklinks } from './useBacklinks';

const deleteBacklinks = async (noteId: string) => {
  const notes = store.getState().notes;
  const backlinks = computeLinkedBacklinks(notes, noteId);
  const updateData: Pick<Note, 'id' | 'content'>[] = [];

  for (const backlink of backlinks) {
    const note = notes[backlink.id];

    if (!note) { continue; }

    const editor = createEditor();
    editor.children = note.content;

    Transforms.unwrapNodes(editor, {
      at: [],
      match: (n) =>
        !Editor.isEditor(n) &&
        Element.isElement(n) &&
        n.type === ElementType.NoteLink &&
        n.noteId === noteId,
    });

    updateData.push({
      id: backlink.id,
      content: editor.children,
    });
  }

  // Make sure backlinks are updated locally
  for (const newNote of updateData) {
    store.getState().updateNote(newNote);
  }
  const currentDir = store.getState().currentDir;
  if (currentDir) { await writeJsonFile(currentDir); } // sync store to JSON
};

export default deleteBacklinks;
