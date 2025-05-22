'use client'

import { useAuth } from '@/contexts/AuthContext'
import { Tile, TileMap } from '@/types/tiles'
import { isTileMessage, ColonyWebSocketMessage } from '@/types/websocket'
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'
import { useTileMessageBuffer } from '@/hooks/useTileMessageBuffer'
import { updateDrawingTileCache } from '@/services/DrawingTilesService'

interface DrawingTilesContextType {
  drawingTiles: TileMap;
  setDrawingTiles: React.Dispatch<React.SetStateAction<TileMap>>;
}

const DrawingTilesContext = createContext<DrawingTilesContextType | undefined>(undefined);

export function useDrawingTiles() {
  const context = useContext(DrawingTilesContext);
  if (!context) {
    throw new Error('useDrawingTiles must be used within a DrawingTilesProvider');
  }
  return context;
}

export function DrawingTilesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [drawingTiles, setDrawingTiles] = useState<TileMap>({});

  // Process a batch of tile updates
  const processTileBatch = useCallback((tiles: Tile[]) => {
    // Update the tile cache for all tiles
    updateDrawingTileCache(tiles);

    // Process each tile
    tiles.forEach(tile => {
      const existingTile = drawingTiles[tile.id];
      
      if (existingTile) {
        // If only updatedAt changed, just update cache
        if (
          existingTile.q === tile.q &&
          existingTile.r === tile.r &&
          existingTile.s === tile.s &&
          existingTile.color === tile.color &&
          existingTile.controllerUid === tile.controllerUid &&
          existingTile.viewHash === tile.viewHash
        ) {
          // Only updatedAt changed, no need to trigger UI update
          return;
        }
      }

      // Fields differ or new tile, update UI
      setDrawingTiles(prev => ({
        ...prev,
        [tile.id]: {
          ...tile,
          viewHash: `${tile.color}|${tile.controllerUid}` // Recompute viewHash
        }
      }));
    });
  }, [drawingTiles]);

  // Use the message buffer hook to batch process incoming tile messages
  const bufferTileMessage = useTileMessageBuffer({
    bufferTimeMs: 100, // Buffer updates for 100ms
    onFlush: processTileBatch
  });

  // Handle WebSocket messages using the buffer
  const handleMessage = useCallback((data: ColonyWebSocketMessage) => {
    if (isTileMessage(data) && data.payload) {
      const tile = data.payload;
      console.log(`WebSocket: Received drawing tile update for tile at ${tile.q},${tile.r},${tile.s}`);
      bufferTileMessage(tile);
    }
  }, [bufferTileMessage]);

  // Subscribe to WebSocket messages for tile updates
  useWebSocketSubscription({
    onMessage: handleMessage
  });

  const value = {
    drawingTiles,
    setDrawingTiles
  };

  return (
    <DrawingTilesContext.Provider value={value}>
      {children}
    </DrawingTilesContext.Provider>
  );
} 