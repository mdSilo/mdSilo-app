import { Editor, Path } from 'slate';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-toastify';
import { insertImage } from 'editor/formatting';
import { isUrl } from 'utils/helper';
import imageExtensions from 'utils/image-extensions';
import apiClient from 'lib/apiClient';

// upload image and insert to note, must be online
const withImages = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = (data) => {
    const text = data.getData('text/plain');
    const { files } = data;

    // TODO: there is a bug on iOS Safari where the files array is empty
    // See https://github.com/ianstormtaylor/slate/issues/4491
    if (files && files.length > 0) {
      for (const file of files) {
        const [mime] = file.type.split('/');
        if (mime === 'image') {
          uploadAndInsertImage(editor, file);
        } else {
          toast.error('Only images can be uploaded.');
        }
      }
    } else if (isImageUrl(text)) {
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

// TODO: customize image host services
export const uploadAndInsertImage = async (
  editor: Editor,
  file: File,
  path?: Path
) => {
  const user = apiClient.auth.user();

  if (!user) {
    return;
  }

  // Enforce upload limits
  const UPLOAD_LIMIT = 5 * 1024 * 1024; // 5 MB

  if (file.size > UPLOAD_LIMIT) {
    toast.error('Your image is over the 5 MB limit.');
    return;
  }

  const uploadingToast = toast.info('Uploading image, Please wait...', {
    autoClose: false,
    closeButton: false,
    draggable: false,
  });
  const key = `${user.id}/${uuidv4()}.png`;
  const { error: uploadError } = await apiClient.storage
    .from('user-assets')
    .upload(key, file, { upsert: false });

  if (uploadError) {
    toast.dismiss(uploadingToast);
    toast.error(uploadError);
    return;
  }

  const expiresIn = 60 * 60 * 24 * 365 * 100; // 100 year expiry
  const { signedURL, error: signedUrlError } = await apiClient.storage
    .from('user-assets')
    .createSignedUrl(key, expiresIn);

  toast.dismiss(uploadingToast);
  if (signedURL) {
    insertImage(editor, signedURL, path);
  } else if (signedUrlError) {
    toast.error(signedUrlError);
  } else {
    toast.error(
      'There was a problem uploading your image. Please try again later.'
    );
  }
};

export default withImages;
