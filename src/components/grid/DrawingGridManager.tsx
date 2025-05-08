'use client'

import React, { useCallback } from 'react';
import { GridCanvas, SelectedTile } from '@/components/grid/GridCanvas'
import { useAuth } from '@/contexts/AuthContext'
import { useWarmupFunctions } from '@/hooks/useWarmupFunctions'
import { useHexGridCamera } from '@/hooks/useHexGridCamera';

// Constant for hex size
const HEX_SIZE = 1.2; // Make sure this matches GridCanvas prop

export function DrawingGridManager() {
  const { user } = useAuth();
  useWarmupFunctions();

  // Use the centralized camera logic from the hook
  const { tileMap, isFetching, handleCameraMove } = useHexGridCamera({
    hexSize: HEX_SIZE,
  });

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Tile selected (logic pending):', tile);
    // Placeholder - actual selection/drawing logic will go here
  }

  return (
    <div className="relative h-full w-full">
      <GridCanvas
        wireframe={false}
        hexSize={HEX_SIZE}
        tileMap={tileMap}
        onTileSelect={handleTileSelect}
        onCameraStop={handleCameraMove} // Pass the callback from the hook
      />
       {/* Optional: Loading indicator */}
       {isFetching && (
         <div className="absolute top-2 left-2 bg-yellow-500 text-black p-2 rounded z-10">
            Loading map area...
         </div>
       )}
    </div>
  );
}