import type { ReactNode } from 'react';
import {
  useState,
  useEffect,
  useContext,
  createContext,
  useCallback,
} from 'react';
import { useStore } from 'lib/store';

type AuthContextType = {
  isAuthed: boolean;
  user: null; // AuthUser
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// Provider hook that creates auth object and handles state
function useProvideAuth(): AuthContextType {
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState<null>(null);
  
  const offlineMode = useStore((state) => state.offlineMode);

  // Initialize the user based on the stored session
  const initUser = useCallback(async () => {
    setUser(null);
    setIsAuthed(true);
  }, []);

  useEffect(() => {
    if (offlineMode) {
      setIsAuthed(true);
      return;
    }
    initUser();
  }, [initUser, offlineMode]);

  // Return the user object and auth methods
  return {
    isAuthed,
    user,
  };
}

// Provider component that wraps your app and makes auth object
// available to any child component that calls useAuth().
export function ProvideAuth({ children }: { children: ReactNode }) {
  const auth = useProvideAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

// Hook for child components to get the auth object and re-render when it changes.
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a provider');
  }
  return context;
};
