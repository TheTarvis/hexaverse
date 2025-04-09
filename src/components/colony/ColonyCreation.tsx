import React, { useState } from 'react';
import { useColony } from '@/contexts/ColonyContext';
import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';

// Define available colony colors
const colonyColors = [
  { name: 'indigo', value: '#6366f1', textColor: 'white' },
  { name: 'blue', value: '#3b82f6', textColor: 'white' },
  { name: 'sky', value: '#0ea5e9', textColor: 'white' },
  { name: 'cyan', value: '#06b6d4', textColor: 'white' },
  { name: 'teal', value: '#14b8a6', textColor: 'white' },
  { name: 'emerald', value: '#10b981', textColor: 'white' },
  { name: 'green', value: '#22c55e', textColor: 'white' },
  { name: 'lime', value: '#84cc16', textColor: 'black' },
  { name: 'yellow', value: '#eab308', textColor: 'black' },
  { name: 'amber', value: '#f59e0b', textColor: 'black' },
  { name: 'orange', value: '#f97316', textColor: 'black' },
  { name: 'red', value: '#ef4444', textColor: 'white' },
  { name: 'pink', value: '#ec4899', textColor: 'white' },
  { name: 'purple', value: '#a855f7', textColor: 'white' },
  { name: 'violet', value: '#8b5cf6', textColor: 'white' },
];

export function ColonyCreation() {
  const router = useRouter();
  const { createNewColony, isLoadingColony, error, refreshColony } = useColony();
  const { showToast } = useToast();
  const [colonyName, setColonyName] = useState('');
  const [colonyColor, setColonyColor] = useState(colonyColors[0].value);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!colonyName.trim()) {
      setLocalError('Colony name is required');
      return;
    }
    
    try {
      const colony = await createNewColony(colonyName.trim(), colonyColor);
      // Show success toast
      showToast(`Colony "${colony.name}" created successfully!`, 'success', 2000);
      
      // Refresh the page after a short delay
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err) {
      // Error is already handled in the context
      console.error('Error in colony creation component:', err);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-zinc-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Create Your Colony</h2>
      
      <p className="mb-4 text-gray-700 dark:text-zinc-300">
        Welcome to Hexaverse! To begin your journey, create your first colony by giving it a name and choosing a color.
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

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
            Colony Color
          </label>
          <div className="grid grid-cols-5 gap-2">
            {colonyColors.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setColonyColor(color.value)}
                disabled={isLoadingColony}
                className={`w-full aspect-square rounded-md border ${
                  colonyColor === color.value 
                    ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-zinc-800' 
                    : 'border-gray-300 dark:border-zinc-700'
                } ${isLoadingColony ? 'opacity-70 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: color.value }}
                title={color.name}
                aria-label={`Select ${color.name} color`}
              >
                {colonyColor === color.value && (
                  <span style={{ color: color.textColor }} className="text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
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