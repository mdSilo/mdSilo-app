import React from 'react';
import 'styles/styles.css';
import 'styles/nprogress.css';
import 'react-toastify/dist/ReactToastify.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrent } from 'context/useCurrent';
import Editor from 'components/editor/Editor';
import NotePage from 'components/md';
import { getIndexDemoEditorValue } from 'editor/constants';

const App = () => {
  return (
    <div className="flex flex-1 w-full mx-auto">
      <NotePage noteId={'ea3c58dm-ba42-4c24-9d59-409eacd1demo'} />
    </div>
  )
}

export default App
