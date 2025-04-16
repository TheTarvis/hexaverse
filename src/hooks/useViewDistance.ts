import { useState, useEffect } from 'react';
import { Tile } from '@/types/tiles';
import { ViewableTile } from '@/components/grid/GridCanvas';
import { findViewableTiles } from '@/utils/hexUtils';

interface TileMap {
  [key: string]: Tile;
}

interface UseViewableResult {
  viewableTiles: ViewableTile[];
}

/**
 * Hook that calculates viewable tiles based on the current tile map and a view distance.
 * This hook now just returns raw viewable tile data without colors.
 * Colors should be applied by the consuming component.
 */
export function useViewDistance(tileMap: TileMap, viewDistance: number): UseViewableResult {
  const [viewableTiles, setViewableTiles] = useState<ViewableTile[]>([]);

  // Calculate viewable tiles when tileMap is first loaded or viewDistance changes
  useEffect(() => {
    const hasTiles = Object.keys(tileMap).length > 0;

    if (hasTiles) {
      // Full calculation
      const viewableTilesList = findViewableTiles(tileMap, viewDistance);
      console.log(`useViewDistance: Found ${viewableTilesList.length} potential viewable tiles with depth ${viewDistance}`);
      setViewableTiles(viewableTilesList);
    }
  }, [tileMap, viewDistance]);

  return {
    viewableTiles: viewableTiles
  };
}