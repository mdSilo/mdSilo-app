import MsEditor from "mdsmirror";
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { useCurrentViewContext } from 'context/useCurrentView';
import Chronicle from './chronicle';
import Journals from './journals';
import Tasks from './tasks';
import Graph from './graph';
import NotePage from './md';
import HashTags from "./hashtags";

export default function MainView() {
  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  // 
  return (
    <>
      {viewTy === 'default' ? ( 
        <DefaultView /> 
      ) : viewTy === 'chronicle' ? (
        <Chronicle />
      ) : viewTy === 'task' ? (
        <Tasks />
      ) : viewTy === 'graph' ? (
        <Graph />
      ) : viewTy === 'journal' ? (
        <Journals />
      ) : viewTy === 'tag' ? (
        <HashTags />
      ) : (
        <NotePage />
      )}
    </>
  );
}

function DefaultView() {
  return (
    <ErrorBoundary>
      <div className="flex flex-col p-8 w-full h-full mx-auto bg-white overflow-auto">
        <p className="text-2xl py-3 text-center text-primary-500">
          Hello, welcome to mdSilo Desktop.
        </p>
        <MsEditor value={defaultValue} dark={false} />
      </div>
    </ErrorBoundary>
  );
}

const defaultValue = `
Lightweight **knowledge silo** and networked-writing tool equipped with ==WYSIWYG Markdown editor and reader==. Use it to organize writing, network thoughts and build a Second Brain on top of local plain text Markdown files.

:::info
This is an editable demo.
:::

## Features
  - 📝 All-In-One Editor: Markdown and extensions, WYSIWYG, MindMap...  
  - 🔀 Seamlessly switch between multi-modes: WYSIWYG, Markdown and MindMap  
  - 🗄️ Build personal wiki with bidirectional links 
  - ⌨️ Slash commands, Hotkeys and Hovering toolbar...   
  - 🕸️ Graph view to visualize the networked writing  
  - 📅 Chronicle view and Daily activities graph  
  - ✔️ Task view to track todo/doing/done  
  - 🔍 Full-text search 
  - ✨ Available for Windows, macOS, Linux and Web  

For human brain, Reading and Writing is the I/O: the communication between the information processing system and the outside world. mdSilo is here to boost your daily I/O, it is tiny yet powerful, free for everyone.
\\
`;
