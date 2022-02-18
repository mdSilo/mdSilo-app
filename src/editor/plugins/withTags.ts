import { Editor } from 'slate';
import { ElementType } from 'editor/slate';

const withTags = (editor: Editor) => {
  const { isInline } = editor;

  editor.isInline = (element) => {
    return element.type === ElementType.Tag ? true : isInline(element);
  };

  return editor;
};

export default withTags;
