import React, { useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginModal } from './LoginModal';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // Show login modal if user is not authenticated and not loading
    if (!isLoading && !user) {
      setShowLoginModal(true);
    } else {
      setShowLoginModal(false);
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-700 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Show the login modal if user is not authenticated */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => {
          // Only allow closing if user is authenticated
          if (user) {
            setShowLoginModal(false);
          }
        }} 
      />
      
      {/* Only render children if user is authenticated */}
      {user && children}
    </>
  );
} 