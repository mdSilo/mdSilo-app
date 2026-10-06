import { store } from 'lib/store';
import { setWindowTitle } from 'file/util';

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
  | {
      view: 'md';
      params: ViewParams;
    }
  | {
    view: 'tag';
    tag: string;
  };

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  const actionView = action.view;
  if (actionView === 'md') {
    store.getState().setCurrentNoteId(action.params.noteId);
  } else {
    store.getState().setCurrentNoteId('');
    setWindowTitle(`: ${actionView} - mdSilo`);
  }

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
      setWindowTitle(`: #${action.number} - mdSilo`);
      return {view: 'issue', issueNumber: action.number};
    case 'project':
      return {view: 'project', projectId: action.projectId};
    case 'md':
      return {view: 'md', params: action.params};
    case 'tag':
      return {view: 'tag', tag: action.tag};
    default:
      throw new Error();
  }
}
