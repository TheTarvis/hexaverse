'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { fetchTiles, invalidateTileCache } from '@/services/tiles';
import { Tile } from '@/types/tiles';

interface TileContextType {
  isLoadingTiles: boolean;
  loadTiles: (tileIds: string[], options?: { forceRefresh?: boolean; specificTileIds?: string[] }) => Promise<Tile[]>;
  invalidateTileCache: (tileIds: string[]) => void;
}

const TileContext = createContext<TileContextType | undefined>(undefined);

export function TileProvider({ children }: { children: ReactNode }) {
  const [isLoadingTiles, setIsLoadingTiles] = useState(false);

  /**
   * Load tiles by their IDs
   */
  const loadTiles = useCallback(async (
    tileIds: string[],
    options?: { forceRefresh?: boolean; specificTileIds?: string[] }
  ): Promise<Tile[]> => {
    if (!tileIds.length) return [];
    
    setIsLoadingTiles(true);
    
    try {
      const tiles = await fetchTiles(tileIds, options);
      return tiles;
    } catch (err) {
      console.error('Error loading tiles:', err);
      return [];
    } finally {
      setIsLoadingTiles(false);
    }
  }, []);

  const value = {
    isLoadingTiles,
    loadTiles,
    invalidateTileCache
  };

  return (
    <TileContext.Provider value={value}>
      {children}
    </TileContext.Provider>
  );
}

export function useTiles() {
  const context = useContext(TileContext);
  if (context === undefined) {
    throw new Error('useTiles must be used within a TileProvider');
  }
  return context;
} 