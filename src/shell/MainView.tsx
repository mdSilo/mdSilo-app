import { lazy, Suspense, type ComponentType } from 'react';
import MsEditor from "mdsmirror";
import { useStore } from '@/state/store';
import { EDITOR_THEME } from '@/lib/themes';
import ErrorBoundary from '@/ui/ErrorBoundary';
import { Spinner } from '@/ui/ui';
import useNoteTaskSync from '@/issue/useNoteTaskSync';
import { useCurrentViewContext } from '@/state/useCurrentView';
import useStartupView from '@/state/useStartupView';
import NotePage from '@/writer/MdView';

// loaded on first use: their code (d3, dnd-kit...) is not needed on start
const Feed = lazy(() => import('@/feed/FeedView'));
const Chronicle = lazy(() => import('@/insight/Chronicle'));
const Issues = lazy(() => import('@/issue/IssuesView'));
const IssuePage = lazy(() => import('@/issue/IssuesView').then((m) => ({ default: m.IssuePage })));
const ProjectView = lazy(() => import('@/issue/ProjectView'));
const Graph = lazy(() => import('@/insight/Graph'));
const Journals = lazy(() => import('@/insight/Journals'));
const HashTags = lazy(() => import('@/insight/Hashtags'));
const Library = lazy(() => import('@/reader/library/LibraryView'));
const Reader = lazy(() => import('@/reader/components/ReaderView'));
const Vocabulary = lazy(() => import('@/reader/vocabulary/VocabularyView'));

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
      <Spinner />
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
**A hub for your personal I/O: Reading (input) → Issue (process) → Writing (output).**

mdSilo keeps what you read, what you think and what you write in one local workspace of plain Markdown files, tied together by links. Get the Desktop Application [here](https://github.com/mdSilo/mdSilo-app/releases).

## Features  
  - 📖 Reading: books (EPUB, PDF...), feeds and podcasts; highlights and notes saved as Markdown  
  - 🧩 Issue: issues, labels, milestones and project boards; made from a highlight, a selection or a task in a note (#todo# #doing# #done#, checkboxes)  
  - ✍️ Writing: WYSIWYG Markdown, mind map, diagram, math; slash commands, hotkeys and hovering toolbar  
  - 🔗 Linking: \`[[notes]]\`, \`{{books}}\`, issues, hashtags and backlinks; Graph view; Chronicle and activity heat map  
  - 🔍 Full-text search over notes, annotations and books  
  - 🔄 Sync with git (GitHub, Gitea...) and publish chosen notes as a website, in the desktop app  
  - ✨ Windows, macOS, Linux and Web; local plain files, no account  

For a human brain, reading and writing are the I/O. mdSilo is here to boost it: tiny yet powerful, free for everyone.

New here? Read the Manual: it is in the sidebar of the web version, and in \`docs/manual\` of the repo.
`;
