import MsEditor from "mdsmirror";
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { useCurrentViewContext } from 'context/useCurrentView';
import Chronicle from './chronicle';
import Journals from './journals';
import Tasks from './tasks';
import Graph from './graph';
import NotePage from './md';
import HashTags from "./hashtags";
import Feed from "./feed";
import Issues, { IssuePage } from "./issues";
import ProjectView from "./project";

export default function MainView() {
  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  // 
  return (
    <>
      {viewTy === 'default' ? ( 
        <DefaultView /> 
      ) : viewTy === 'feed' ? (
        <Feed />
      ) : viewTy === 'chronicle' ? (
        <Chronicle />
      ) : viewTy === 'task' ? (
        <Tasks />
      ) : viewTy === 'issues' ? (
        <Issues />
      ) : viewTy === 'issue' ? (
        <IssuePage />
      ) : viewTy === 'project' ? (
        <ProjectView />
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
          Hello, welcome to mdSilo.
        </p>
        <MsEditor value={defaultValue} dark={false} />
      </div>
    </ErrorBoundary>
  );
}

const defaultValue = `
A lightweight, local-first personal Wiki and knowledge base for storing ideas, thought, knowledge with the powerful all-in-one reading/writing tool. Use it to organize writing, network thoughts and build a Second Brain on top of local plain text Markdown files.

## Features  
  - ➰ I/O: Feed & Podcast client(Input) and Personal Wiki(Output); 
  - 🔀 All-In-One Editor: Markdown, WYSIWYG, Mind Map...  
  - 📝 Markdown and extensions: Math/Chemical Equation, Diagram, Hashtag...   
  - 🗄️ Build personal wiki with bidirectional wiki links 
  - ⌨️ Slash commands, Hotkeys and Hovering toolbar...  
  - 📋 Projects: Kanban boards and tables to manage the process of knowledge growing   
  - 🐞 Built-in issue tracker: labels, milestones and comments, linked to notes   
  - 🕸️ Graph view to visualize the networked writing  
  - 📅 Chronicle view and Daily activities graph  
  - ✔️ Task view to track todo/doing/done  
  - 🔍 Full-text search 
  - ✨ Available for Windows, macOS, Linux and Web  

For human brain, Reading and Writing is the I/O: the communication between the information processing system and the outside world. mdSilo is here to boost your daily I/O, it is tiny yet powerful, free for everyone.
\\
`;
