import { store } from '@/lib/store';
import { setWindowTitle } from '@/file/util';

export const initialState = {view: 'default'};

/** tabs of the Issues view; tasks replaced the old Task view */
export type IssuesTab = 'issues' | 'tasks' | 'labels' | 'milestones';

type ViewParams = { noteId: string; stackIds?: string[], hash?: string };

export interface ViewState {
  view: string;
  params?: ViewParams; 
  tag?: string; 
  issueNumber?: number;
  issuesTab?: IssuesTab;
  projectId?: string;
  /** the book file read, see reader */
  bookPath?: string;
  /** the place to open the book at, a CFI */
  bookCfi?: string;
}

export type ViewAction = 
  | { view: 'default' }
  | { view: 'feed' }
  | { view: 'chronicle' }
  | { view: 'graph' }
  | { view: 'journal' }
  | { view: 'issues'; tab?: IssuesTab }
  | { view: 'issue'; number: number }
  | { view: 'project'; projectId?: string }
  | { view: 'library' }
  | { view: 'vocabulary' }
  | { view: 'book'; path: string; cfi?: string }
  | {
      view: 'md';
      params: ViewParams;
    }
  | {
    view: 'tag';
    tag: string;
  };

/**
 * What goes with a view, outside of its state: the current note, the window
 * title, the explorer hidden. Run on dispatch, not in the reducer: a reducer
 * runs while React renders, where other components must not be updated.
 */
export function viewEffects(action: ViewAction) {
  const { view } = action;
  if (view === 'md') {
    store.getState().setCurrentNoteId(action.params.noteId);
    return;
  }
  store.getState().setCurrentNoteId('');
  if (view === 'issue') setWindowTitle(`#${action.number} - mdSilo`);
  else if (view === 'book') setWindowTitle(`${action.path.split('/').pop()} - mdSilo`);
  else setWindowTitle(`${view} - mdSilo`);
  // the books take the room of the note tree
  if (view === 'library' || view === 'book' || view === 'vocabulary') store.getState().setIsSidebarOpen(false);
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  const actionView = action.view;
  switch (actionView) {
    case 'default':
      return {...state, view: 'default'};
    case 'feed':
      return {...state, view: 'feed'};
    case 'chronicle':
      return {...state, view: 'chronicle'};
    case 'graph':
      return {...state, view: 'graph'};
    case 'journal':
      return {...state, view: 'journal'};
    case 'issues':
      return {view: 'issues', ...(action.tab ? {issuesTab: action.tab} : {})};
    case 'issue':
      return {view: 'issue', issueNumber: action.number};
    case 'project':
      return {view: 'project', projectId: action.projectId};
    case 'library':
      return {view: 'library'};
    case 'vocabulary':
      return {view: 'vocabulary'};
    case 'book':
      return {view: 'book', bookPath: action.path, bookCfi: action.cfi};
    case 'md':
      return {view: 'md', params: action.params};
    case 'tag':
      return {view: 'tag', tag: action.tag};
    default:
      throw new Error();
  }
}
