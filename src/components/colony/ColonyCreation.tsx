import React, { useState } from 'react';
import { useColony } from '@/contexts/ColonyContext';

export function ColonyCreation() {
  const { createNewColony, isLoadingColony, error } = useColony();
  const [colonyName, setColonyName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!colonyName.trim()) {
      setLocalError('Colony name is required');
      return;
    }
    
    try {
      await createNewColony(colonyName.trim());
    } catch (err) {
      // Error is already handled in the context
      console.error('Error in colony creation component:', err);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Create Your Colony</h2>
      
      <p className="mb-4 text-gray-700 dark:text-zinc-300">
        Welcome to Hexaverse! To begin your journey, create your first colony by giving it a name.
      </p>
      
      {(error || localError) && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error || localError}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="colony-name" className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Colony Name
          </label>
          <input
            id="colony-name"
            type="text"
            value={colonyName}
            onChange={(e) => {
              setColonyName(e.target.value);
              setLocalError(null);
            }}
            disabled={isLoadingColony}
            className="w-full px-4 py-2 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-70"
            placeholder="Enter a name for your colony"
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoadingColony}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoadingColony ? 'Creating...' : 'Create Colony'}
        </button>
      </form>
    </div>
  );
} 