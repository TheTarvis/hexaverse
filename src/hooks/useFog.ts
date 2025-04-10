import { useState, useEffect } from 'react';
import { Tile } from '@/types/tiles';
import { FogTile } from '@/components/grid/GridCanvas';
import { findFogTiles, updateFogTilesForAddedTile } from '@/utils/hexUtils';

interface TileMap {
  [key: string]: Tile;
}

interface UseFogResult {
  fogTiles: FogTile[];
}

export function useFog(tileMap: TileMap, fogDistance: number): UseFogResult {
  const [fogTiles, setFogTiles] = useState<FogTile[]>([]);

  // Initial fog calculation when tileMap is first loaded or fogDistance changes
  useEffect(() => {
    const hasTiles = Object.keys(tileMap).length > 0;

    if (hasTiles) {
      // Full calculation
      const fogTilesList = findFogTiles(tileMap, fogDistance);
      console.log(`Full calculation: Found ${fogTilesList.length} potential fog tiles with depth ${fogDistance}`);
      setFogTiles(fogTilesList);
    }
  }, [tileMap, fogDistance]);


  return {
    fogTiles
  };
}