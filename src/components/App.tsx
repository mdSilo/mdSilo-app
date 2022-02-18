import React from 'react';
import 'styles/styles.css';
import 'styles/nprogress.css';
import 'react-toastify/dist/ReactToastify.css';
import 'tippy.js/dist/tippy.css';
import { ProvideCurrent } from 'editor/hooks/useCurrent';
import Editor from 'components/editor/Editor';
import { getIndexDemoEditorValue } from 'editor/constants';

const App = () => {
  return (
    <div className="flex flex-1 w-full mx-auto">
      <ProvideCurrent value={{ ty: 'note', id: '0000' }}>
        <Editor
          className="flex-1 p-8"
          value={getIndexDemoEditorValue()}
          setValue={() => {/*do nothing*/}}
          onChange={() => {/*do nothing*/}}
        />
      </ProvideCurrent>
    </div>
  )
}

export default App
