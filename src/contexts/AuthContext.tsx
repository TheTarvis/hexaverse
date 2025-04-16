'use client';

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
  isAdmin: boolean;
  isCheckingAdmin: boolean;
  userToken: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [userToken, setUserToken] = useState<string | null>(null);

  // Get user token
  const getUserToken = async (user: User | null) => {
    if (!user) {
      setUserToken(null);
      return;
    }
    
    try {
      const token = await user.getIdToken();
      setUserToken(token);
    } catch (error) {
      console.error('Error getting user token:', error);
      setUserToken(null);
    }
  };

  // Check if the user has admin claim
  const checkAdminStatus = async (user: User | null) => {
    setIsCheckingAdmin(true);
    
    if (!user) {
      setIsAdmin(false);
      setIsCheckingAdmin(false);
      return;
    }
    
    try {
      const token = await user.getIdTokenResult();
      setIsAdmin(token.claims.admin === true);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    } finally {
      setIsCheckingAdmin(false);
    }
  };

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
      
      // Check admin status whenever user changes
      checkAdminStatus(authUser);
      
      // Get user token whenever user changes
      getUserToken(authUser);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    isLoading,
    isAdmin,
    isCheckingAdmin,
    userToken,
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