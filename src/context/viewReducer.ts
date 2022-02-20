export const initialState = {view: 'task'};

type ViewParams = { noteId: string; stackIds?: string[], hash?: string };

export interface ViewState {
  view: string;
  params?: ViewParams; 
}

export type ViewAction =
  | { view: 'chronicle' }
  | { view: 'task' }
  | { view: 'graph' }
  | { view: 'journal' }
  | {
      view: 'md';
      params: ViewParams;
    };

export function viewReducer(state: ViewState, action: ViewAction) {
  switch (action.view) {
    case 'chronicle':
      return {...state, view: 'chronicle'};
    case 'task':
      return {...state, view: 'task'};
    case 'graph':
      return {...state, view: 'graph'};
    case 'journal':
      return {...state, view: 'journal'};
    case 'md':
      return {view: 'md', params: action.params};
    default:
      throw new Error();
  }
}
