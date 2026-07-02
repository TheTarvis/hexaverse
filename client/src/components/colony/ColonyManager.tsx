import React from 'react';
import { useColony } from '@/contexts/ColonyContext';
import { useAuth } from '@/contexts/AuthContext';
import { ColonyInfo } from './ColonyInfo';

export function ColonyManager() {
  const { colony, isLoadingColony } = useColony();
  const { user, isLoading: isLoadingAuth } = useAuth();

  if (isLoadingAuth || !user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600 dark:text-zinc-400">
          Please log in to manage your colony.
        </p>
      </div>
    );
  }

  if (isLoadingColony || !colony) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-800 rounded-xl shadow-md animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ColonyInfo />
    </div>
  );
} 