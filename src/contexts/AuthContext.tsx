import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, getRedirectResult } from 'firebase/auth';
import { 
  getCurrentUser, 
  subscribeToAuthChanges, 
  signInWithEmail, 
  signInWithGoogle, 
  signOutUser,
  createUser
} from '@/services/auth';
import { auth } from '@/config/firebase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for redirect result on component mount
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log('Redirect result processed successfully:', result.user.uid);
        }
      } catch (error) {
        console.error('Error processing redirect result:', error);
      }
    };

    // Run once on mount
    checkRedirectResult();
    
    // Initialize auth state
    const unsubscribe = subscribeToAuthChanges((authUser) => {
      setUser(authUser);
      setIsLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    isLoading,
    signIn: signInWithEmail,
    signInWithGoogle,
    signUp: createUser,
    signOut: signOutUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 