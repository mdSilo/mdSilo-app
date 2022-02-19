import type { ReactNode } from 'react';
import { useContext, createContext } from 'react';

type Current = {
  ty: string;
  id: string;
};

const CurrContext = createContext<Current | undefined>(undefined);

export function ProvideCurrent({
  children,
  value,
}: {
  children: ReactNode;
  value: Current;
}) {
  return <CurrContext.Provider value={value}>{children}</CurrContext.Provider>;
}

export const useCurrentContext = () => {
  const context = useContext(CurrContext);
  if (context === undefined) {
    throw new Error('useCurrentContext must be used within a provider');
  }
  return context;
};
