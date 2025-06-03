'use client'

import React, { useState } from 'react';
import { HexColorPicker } from '@/components/grid/HexColorPicker';
import { Tile } from '@/types/tiles';
import { useAuth } from '@/contexts/AuthContext';

interface DrawingColorPickerProps {
  selectedTile: Tile | null;
  previewMode: boolean;
  onColorChange: (color: string) => void;
  onTogglePreviewMode: () => void;
  initialColor?: string;
}

export function DrawingColorPicker({
  selectedTile,
  previewMode,
  onColorChange,
  onTogglePreviewMode,
  initialColor = '#FF5252',
}: DrawingColorPickerProps) {
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const { user, isLoading } = useAuth();

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    onColorChange(color);
  };

  const isLoggedIn = !isLoading && user !== null;

  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-zinc-800 rounded-lg shadow-md p-4">
      {/* Main content */}
      <HexColorPicker 
        onColorSelect={handleColorSelect} 
        initialColor={selectedColor}
      />
      <div className="text-center mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {selectedTile ? `Editing tile at (${selectedTile.q},${selectedTile.r})` : 'Select a tile to paint'}
      </div>
      <div className="flex justify-center mt-2">
        <button 
          onClick={onTogglePreviewMode}
          className={`px-3 py-1 text-xs rounded-full ${
            previewMode 
              ? 'bg-blue-500 text-white' 
              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
          }`}
        >
          {previewMode ? 'Paint on Hover: ON' : 'Paint on Hover: OFF'}
        </button>
      </div>

      {/* Not logged in overlay */}
      {!isLoggedIn && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
          <div className="text-center text-white p-4">
            <div className="text-sm font-medium mb-1">
              Login Required
            </div>
            <div className="text-xs opacity-90">
              Sign in to start drawing
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 