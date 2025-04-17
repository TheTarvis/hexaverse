import React from 'react';
import { useColony } from '@/contexts/ColonyContext';

export function ColonyInfo() {
  const { colony, isLoadingColony, error, refreshColony } = useColony();

  // Handler for manual refresh that forces a fresh fetch
  const handleRefresh = () => {
    refreshColony();
  };

  if (isLoadingColony) {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-md animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-3/4 mb-3"></div>
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-5/6 mb-2"></div>
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-2/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl">
        <h3 className="font-bold mb-2">Error Loading Colony</h3>
        <p>{error}</p>
        <button 
          onClick={handleRefresh} 
          className="mt-2 px-3 py-1 bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded hover:bg-red-300 dark:hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!colony) {
    return null;
  }

  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-md">
      <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">{colony.name}</h3>
      
      <div className="mb-3">
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Created: {colony.createdAt instanceof Date 
            ? colony.createdAt.toLocaleDateString() 
            : new Date(colony.createdAt).toLocaleDateString()}
        </p>
      </div>
      
      <div className="mb-3">
        <h4 className="font-semibold text-gray-700 dark:text-zinc-300 mb-1">Start Coordinates</h4>
        <div className="bg-gray-100 dark:bg-zinc-700 rounded p-2 text-sm">
          q: {colony.startCoordinates.q}, 
          r: {colony.startCoordinates.r}, 
          s: {colony.startCoordinates.s}
        </div>
      </div>
      
      <div>
        <h4 className="font-semibold text-gray-700 dark:text-zinc-300 mb-1">Tiles</h4>
        <p className="text-sm text-gray-600 dark:text-zinc-400">
        {colony.tileIds?.length ?? 0} tiles in your colony
        </p>
      </div>
      
      <button 
        onClick={handleRefresh}
        className="mt-3 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800/40"
      >
        Refresh
      </button>
    </div>
  );
} 