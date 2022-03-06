import type { ReactNode } from 'react';
import { useContext, createContext, Dispatch } from 'react';
import { store } from 'lib/store';
import { ViewAction, ViewState } from './viewReducer';

type CurrentMd = {
  ty: string;
  id: string;
  state: ViewState;
  dispatch: Dispatch<ViewAction>; 
};

const CurrContext = createContext<CurrentMd | undefined>(undefined);

type Props = {
  children: ReactNode;
  value: CurrentMd;
};

export function ProvideCurrentMd({ children, value }: Props) {
  return <CurrContext.Provider value={value}>{children}</CurrContext.Provider>;
}

export const useCurrentMdContext = () => {
  const context = useContext(CurrContext);
  if (context === undefined) {
    throw new Error('useCurrentContext must be used within a provider');
  }
  store.getState().setCurrentNoteId(context.id);
  return context;
};
