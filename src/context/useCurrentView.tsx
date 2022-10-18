import type { ReactNode } from 'react';
import { useContext, createContext, useReducer, Dispatch } from 'react';
import { viewReducer, initialState, ViewAction, ViewState } from './viewReducer';

export type DispatchType = Dispatch<ViewAction>;

type CurrentView = {
  state: ViewState;
  dispatch: DispatchType;
};

const CurrentViewContext = createContext<CurrentView | undefined>(undefined);

export function ProvideCurrentView({ children }: {children: ReactNode;}) {
  const [state, dispatch] = useReducer(viewReducer, initialState);
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
