import { Editor } from 'slate';
import { insertImage } from 'editor/formatting';
import { isUrl } from 'utils/helper';
import imageExtensions from 'utils/image-extensions';

// upload image and insert to note, must be online
const withImages = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = (data) => {
    const text = data.getData('text/plain');

    if (isImageUrl(text)) {
      insertImage(editor, text);
    } else {
      insertData(data);
    }
  };

  return editor;
};

const isImageUrl = (url: string) => {
  if (!url || !isUrl(url)) {
    return false;
  }
  const ext = new URL(url).pathname.split('.').pop();
  if (ext) {
    return imageExtensions.includes(ext);
  }
  return false;
};

export default withImages;
