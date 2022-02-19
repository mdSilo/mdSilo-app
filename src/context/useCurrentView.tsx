import type { ReactNode } from 'react';
import { useContext, createContext } from 'react';

type CurrentView = {
  ty: string;
};

const CurrentViewContext = createContext<CurrentView | undefined>(undefined);

export function ProvideCurrentView({
  children,
  value,
}: {
  children: ReactNode;
  value: CurrentView;
}) {
  return <CurrentViewContext.Provider value={value}>{children}</CurrentViewContext.Provider>;
}

export const useCurrentViewContext = () => {
  const context = useContext(CurrentViewContext);
  if (context === undefined) {
    throw new Error('useCurrentViewContext must be used within a provider');
  }
  return context;
};
