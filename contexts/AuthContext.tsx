// \contexts\AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { startUserPrefsListener, stopUserPrefsListener } from '../store/userPrefsStore';
import { useQueryClient } from '@tanstack/react-query';
import { startSocialListeners, stopSocialListeners } from '../store/socialStore';
import { EVENTS_MINIMAL } from '../lib/queryKeys';
import { useMapStore } from '../store/mapStore';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient(); // <-- keep this here at the top level
  const previousAccount = useRef<string | null | undefined>(undefined);


  useEffect(() => {
    console.log('AuthProvider: Setting up authentication listener');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const accountId = user?.uid ?? null;
      const cached = queryClient.getQueryData<{ accountId?: string | null }>(EVENTS_MINIMAL);
      if (cached && cached.accountId !== accountId) {
        queryClient.removeQueries({ queryKey: EVENTS_MINIMAL, exact: true });
      }
      if (previousAccount.current !== undefined && previousAccount.current !== accountId) {
        queryClient.clear();
        useMapStore.getState().setAllEvents([], { projectViewport: 'refresh' });
      }
      previousAccount.current = accountId;
      console.log('AuthProvider: Auth state changed', user ? 'User logged in' : 'No user');
      setUser(user);
      setIsLoading(false);

      // ✨ Keep cache consistent with auth state
      if (user) {
        // Keep shared bootstrap data (events-minimal), clear user-scoped queries
        queryClient.invalidateQueries({
          predicate: (q) =>
            !(Array.isArray(q.queryKey) && q.queryKey[0] === 'events-minimal')
        });
        startUserPrefsListener(user.uid);
        startSocialListeners(user.uid);
      } else {
        // Clear user-specific data
        queryClient.clear();
        stopUserPrefsListener();
        stopSocialListeners();
      }

    });

    return () => {
      console.log('AuthProvider: Cleaning up authentication listener');
      unsubscribe();
      stopUserPrefsListener();
      stopSocialListeners();

    };
  }, [queryClient]); 

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
