import { lazy, Suspense, type ComponentType } from 'react';
import MsEditor from "mdsmirror";
import { useStore } from 'lib/store';
import { EDITOR_THEME } from 'lib/themes';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import Spinner from 'components/misc/Spinner';
import useNoteTaskSync from 'components/issue/useNoteTaskSync';
import { useCurrentViewContext } from 'context/useCurrentView';
import useStartupView from 'context/useStartupView';
import NotePage from './md';

// loaded on first use: their code (d3, dnd-kit...) is not needed on start
const Feed = lazy(() => import('./feed'));
const Chronicle = lazy(() => import('./chronicle'));
const Issues = lazy(() => import('./issues'));
const IssuePage = lazy(() => import('./issues').then((m) => ({ default: m.IssuePage })));
const ProjectView = lazy(() => import('./project'));
const Graph = lazy(() => import('./graph'));
const Journals = lazy(() => import('./journals'));
const HashTags = lazy(() => import('./hashtags'));
const Library = lazy(() => import('reader/components/Library'));
const Reader = lazy(() => import('reader/components/ReaderView'));
const Vocabulary = lazy(() => import('reader/components/Vocabulary'));

/** the view of each view type; any other type is a note */
const VIEWS: Record<string, ComponentType> = {
  default: DefaultView,
  feed: Feed,
  chronicle: Chronicle,
  issues: Issues,
  issue: IssuePage,
  project: ProjectView,
  graph: Graph,
  journal: Journals,
  tag: HashTags,
  library: Library,
  book: Reader,
  vocabulary: Vocabulary,
};

export default function MainView() {
  // issues created from note tasks follow their tasks, whatever the view
  useNoteTaskSync();
  useStartupView();
  const viewTy = useCurrentViewContext().state.view;
  const View = VIEWS[viewTy] ?? NotePage;
  return (
    <Suspense fallback={<ViewLoading />}>
      <View />
    </Suspense>
  );
}

function ViewLoading() {
  return (
    <div className="flex items-center justify-center w-full h-full" data-testid="view-loading">
      <Spinner className="w-8 h-8" />
    </div>
  );
}

function DefaultView() {
  const darkMode = useStore((state) => state.darkMode);
  return (
    <ErrorBoundary>
      <div className="flex flex-col p-8 w-full h-full mx-auto bg-base-100 overflow-auto">
        <p className="text-2xl py-3 text-center text-primary">
          Hello, welcome to mdSilo.
        </p>
        <MsEditor value={defaultValue} dark={darkMode} theme={EDITOR_THEME} />
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
  - 🎯 Built-in issue tracker: labels, milestones and comments, linked to notes; tasks in notes (#todo# #doing# #done#, checkboxes) become issues   
  - 🕸️ Graph view to visualize the networked writing  
  - 📅 Chronicle view and Daily activities graph  
  - 🔍 Full-text search 
  - ✨ Available for Windows, macOS, Linux and Web  

For human brain, Reading and Writing is the I/O: the communication between the information processing system and the outside world. mdSilo is here to boost your daily I/O, it is tiny yet powerful, free for everyone.
\\
`;
