import { Editor, Point, Transforms } from 'slate';
import { ElementType, PubLink } from 'editor/slate';
import { getOrCreateWikiId } from 'editor/handleNoteId';
import { createNodeId } from '../withNodeId';
import { deleteMarkup } from './handleInlineShortcuts';

export default function handleCustomPubLink(
  editor: Editor,
  result: RegExpMatchArray,
  endOfMatchPoint: Point,
  textToInsertLength: number,
): boolean {
  const [, startMark, linkText, middleMark, noteTitle, endMark] = result;

  // Get wiki note id or title
  const noteId = getOrCreateWikiId(noteTitle);

  if (!noteId.trim()) {
    return false;
  }

  // Wrap text in a link
  const linkTextRange = deleteMarkup(editor, endOfMatchPoint, {
    startMark: startMark.length,
    text: linkText.length,
    endMark: middleMark.length + noteTitle.length + endMark.length,
    textToInsert: textToInsertLength,
  });
  const link: PubLink = {
    id: createNodeId(),
    type: ElementType.PubLink,
    noteId, // maybe same to noteTitle
    noteTitle,
    customText: linkText,
    children: [],
  };
  Transforms.wrapNodes(editor, link, {
    at: linkTextRange,
    split: true,
  });
  Transforms.move(editor, { unit: 'offset' });

  return true;
}
