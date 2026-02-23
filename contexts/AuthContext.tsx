// \contexts\AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { startUserPrefsListener, stopUserPrefsListener } from '../store/userPrefsStore';
import { useQueryClient } from '@tanstack/react-query';

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


  useEffect(() => {
    console.log('AuthProvider: Setting up authentication listener');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
      } else {
        // Clear user-specific data
        queryClient.clear();
        stopUserPrefsListener();
      }

    });

    return () => {
      console.log('AuthProvider: Cleaning up authentication listener');
      unsubscribe();
      stopUserPrefsListener();

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