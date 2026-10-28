import type { ReactNode } from 'react';
import { useCallback, useContext, createContext, useReducer, Dispatch } from 'react';
import { viewEffects, viewReducer, initialState, ViewAction, ViewState } from './viewReducer';

export type DispatchType = Dispatch<ViewAction>;

type CurrentView = {
  state: ViewState;
  dispatch: DispatchType;
};

const CurrentViewContext = createContext<CurrentView | undefined>(undefined);

export function ProvideCurrentView({ children }: {children: ReactNode;}) {
  const [state, reduce] = useReducer(viewReducer, initialState);
  const dispatch = useCallback((action: ViewAction) => {
    viewEffects(action);
    reduce(action);
  }, []);
  return (
    <CurrentViewContext.Provider value={{ state, dispatch }}>
      {children}
    </CurrentViewContext.Provider>
  );
}

export const useCurrentViewContext = () => {
  const context = useContext(CurrentViewContext);
  if (context === undefined) {
    throw new Error('useCurrentViewContext must be used within a provider');
  }
  return context;
};
