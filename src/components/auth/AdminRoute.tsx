'use client';

import React, { ReactNode, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading, isAdmin, isCheckingAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth is not loading and user is not logged in, redirect to login
    if (!isLoading && !user) {
      router.push('/');
      return;
    }

    // If admin status check is complete and user is not an admin, redirect
    if (!isCheckingAdmin && !isAdmin) {
      router.push('/roadmap');
    }
  }, [user, isLoading, isAdmin, isCheckingAdmin, router]);

  // Show loading state while checking
  if (isLoading || isCheckingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // If not admin, return nothing while redirect happens
  if (!isAdmin) {
    return null;
  }

  // Render children if user is admin
  return <>{children}</>;
} 