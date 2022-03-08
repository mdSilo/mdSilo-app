import { Editor, Path } from 'slate';
import { convertFileSrc, invoke } from '@tauri-apps/api/tauri';
import { insertImage } from 'editor/formatting';
import { isUrl } from 'utils/helper';
import imageExtensions from 'utils/image-extensions';
import { openFileDilog } from 'file/open';

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


export const uploadAndInsertImage = async (
  editor: Editor,
  dir?: string, // current work dir
  path?: Path,
) => {
  const imagePath = await openFileDilog(imageExtensions, false);
  if (imagePath && typeof imagePath === 'string') {
    // move the image to current dir's asset folder 
    // TODO: how to just use relative path (./workDir/assets/img.png)
    // thus minimize the effect when move the work dir
    let movedImgPath = imagePath;
    if (dir) {
      movedImgPath = await invoke<string>(
        'copy_file_to_assets', { srcPath: imagePath, workDir: dir }
      ) || imagePath;
    }
    const imageUrl = convertFileSrc(movedImgPath);
    insertImage(editor, imageUrl, path);
  }
};
