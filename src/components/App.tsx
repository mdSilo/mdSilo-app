import React from 'react';
import '../App.css';
//import Editor from './Editor'
import { ProvideCurrent } from 'editor/hooks/useCurrent';
import Editor from 'components/editor/Editor';
import { getIndexDemoEditorValue } from 'editor/constants';

const App = () => {
  return (
    <div className="flex flex-1 w-full mx-auto">
      <ProvideCurrent value={{ ty: 'note', id: '0000' }}>
        <Editor
          className="flex-1 px-8 pt-2 pb-8 md:pb-12 md:px-12 bg-gray-800"
          value={getIndexDemoEditorValue()}
          setValue={() => {/*do nothing*/}}
          onChange={() => {/*do nothing*/}}
        />
      </ProvideCurrent>
    </div>
  )
}

export default App
