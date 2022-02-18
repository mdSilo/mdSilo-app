import { Editor, Element } from 'slate';
import { ElementType } from 'editor/slate';
import handleBlockShortcuts from './handleBlockShortcuts';
import handleInlineShortcuts from './handleInlineShortcuts';

// Add auto-markdown formatting shortcuts
const withAutoMarkdown = (editor: Editor, isWiki: boolean) => {
  const { insertText, insertData } = editor;

  editor.insertText = (text) => {
    const handled = handleAutoMarkdown(editor, text, isWiki);
    if (!handled) {
      // text = text.replace(/\r\n?/g, '\n');
      insertText(text);
    }
  };

  editor.insertData = (data) => {
    const text = data.getData('text/plain');
    const handled = handleAutoMarkdown(editor, text, isWiki);

    // in code block
    if (handled === undefined) {
      const txt = text.replace(/\r\n?/g, '\n');
      insertText(txt);
      return;
    }
    
    if (!handled) {
      insertData(data);
    }
  };

  return editor;
};

const handleAutoMarkdown = (editor: Editor, text: string, isWiki: boolean) => {
  // Don't handle auto markdown shortcuts in code blocks
  const inCodeBlock = Editor.above(editor, {
    match: (n) =>
      !Editor.isEditor(n) &&
      Element.isElement(n) &&
      n.type === ElementType.CodeBlock,
  });

  if (inCodeBlock) {
    return undefined;
  }

  // Handle shortcuts at the beginning of a line
  const blockHandled = handleBlockShortcuts(editor, text);
  if (blockHandled) {
    return blockHandled;
  }

  // Handle inline shortcuts
  const inlineHandled = handleInlineShortcuts(editor, text, isWiki);
  return inlineHandled;
};

export default withAutoMarkdown;
