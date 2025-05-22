'use client'

import React, { useCallback, useEffect, useRef } from 'react';
import { GridCanvas } from '@/components/grid/GridCanvas'
import { useAuth } from '@/contexts/AuthContext'
import { useHexGridCamera } from '@/hooks/useHexGridCamera';
import { Tile, TileMap } from '@/types/tiles';
import { 
  fetchAllTilesByIdWithCache, 
  updateLocalTileCache,
  onLoadDrawingTiles,
  onUpdateDrawingTile,
  clearAllDrawingTileCache
} from '@/services/DrawingTilesService';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { ColonyWebSocketMessage, DrawingEventsWebsocketMessage, WebSocketMessage } from '@/types/websocket'

// Constant for hex size
const HEX_SIZE = 1.2; // Make sure this matches GridCanvas prop

export function DrawingGridManager() {
  const { user } = useAuth();

  // Keep track of default tiles and initialization
  const defaultTilesRef = useRef<TileMap>({});
  const hasInitializedRef = useRef(false);

  // Function to fetch tiles by their IDs (cache only)
  const fetchTilesByIds = useCallback(async (tileIds: string[]): Promise<Tile[]> => {
    console.log(`[DrawingGridManager] Fetching ${tileIds.length} drawing tiles from cache`);
    const tiles = fetchAllTilesByIdWithCache(tileIds);
    console.log(`[DrawingGridManager] Found ${tiles.length} tiles in cache`);

    // For any tiles not found in cache, use default tiles
    const missingTileIds = tileIds.filter(id => !tiles.find(t => t.id === id));
    const defaultTiles = missingTileIds.map(id => defaultTilesRef.current[id]).filter(Boolean);
    
    return [...tiles, ...defaultTiles];
  }, []);

  // Handle tile updates
  const handleTileUpdate = useCallback((tile: Tile) => {
    console.log(`[DrawingGridManager] Handling tile update for ${tile.id}`);
    updateLocalTileCache(tile);
  }, []);

  // Use the centralized camera logic from the hook
  const { tileMap, isFetching, handleCameraMove, updateTile } = useHexGridCamera({
    hexSize: HEX_SIZE,
    radius: 100,
    fetchTilesByIds,
    onTileUpdate: handleTileUpdate
  });

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    console.log('[DrawingGridManager] Received WebSocket message:', message);
    
      // TODO Check message type to make sure its safe
      const tile = message as Tile;
      console.log('[DrawingGridManager] Processing tile update:', tile);
      
      // Update the tile in the grid
      updateTile(tile.id, tile);
      
      // Update the local cache
      updateLocalTileCache(tile);
  }, [updateTile]);

  // Subscribe to WebSocket messages
  useWebSocketSubscription({
    onMessage: handleWebSocketMessage
  });

  // Initial fetch of all tiles
  useEffect(() => {
    let isMounted = true;

    const fetchInitialTiles = async () => {
      // Skip if we've already initialized or component unmounted
      if (hasInitializedRef.current || !isMounted) {
        console.log('[DrawingGridManager] Skipping initialization - already initialized or unmounted');
        return;
      }

      try {
        console.log('[DrawingGridManager] Starting initial tile fetch...');
        
        // Store current default tiles
        defaultTilesRef.current = { ...tileMap };
        console.log(`[DrawingGridManager] Stored ${Object.keys(defaultTilesRef.current).length} default tiles`);
        
        // Load tiles from the server
        console.log('[DrawingGridManager] Calling onLoadDrawingTiles...');
        const tiles = await onLoadDrawingTiles();
        console.log(`[DrawingGridManager] Successfully loaded ${tiles.length} tiles from server`);
        
        // Only update if still mounted
        if (true) {
          hasInitializedRef.current = true;
          // Update the tile map with the loaded tiles
          tiles.forEach(tile => {
            console.log(`[DrawingGridManager] Updating tile ${tile.id} with color ${tile.color}`);
            // Preserve existing tile data and merge with new data
            const existingTile = tileMap[tile.id];
            const updatedTile = {
              ...existingTile,
              ...tile
            };
            updateTile(tile.id, updatedTile);
          });
                
          
          
          console.log('[DrawingGridManager] Initialization complete');
        }
      } catch (error) {
        console.error('[DrawingGridManager] Error during initialization:', error);
        if (isMounted) {
          hasInitializedRef.current = false; // Reset on error to allow retry
        }
      }
    };

    fetchInitialTiles();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [tileMap, updateTile]); // Add tileMap and updateTile as dependencies

  const handleTileSelect = (tile: Tile) => {
    console.log('[DrawingGridManager] handleTileSelect called with tile:', tile);
    
    // Generate a random color with padded zeros to ensure valid 6-digit hex
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    
    // Construct tile ID based on coordinates
    const tileId = `${tile.q}#${tile.r}#${tile.s}`;
    console.log('[DrawingGridManager] Looking for tile with ID:', tileId);
    
    // Check if the tile exists before updating
    if (tileMap[tileId]) {
      console.log('[DrawingGridManager] Found tile, updating color to:', randomColor);
      // Preserve existing tile data when updating color
      const existingTile = tileMap[tileId];
      const updatedTile = {
        ...existingTile,
        color: randomColor
      };
      // Update the tile with the new color while preserving other properties
      updateTile(tileId, updatedTile);
      onUpdateDrawingTile({
        q: tile.q,
        r: tile.r,
        s: tile.s,
        color: randomColor
      });
    } else {
      console.log('[DrawingGridManager] Tile not found in tileMap, cannot update color');
    }
  }

  const handleClearCache = () => {
    console.log('[DrawingGridManager] Clearing drawing tile cache');
    clearAllDrawingTileCache();
    // Potentially, you might want to re-fetch or update the UI after clearing cache
    // For now, just logging and clearing.
  };

  return (
    <div className="relative h-full w-full">
      {Object.keys(tileMap).length === 0 ? (
        <div className="absolute top-2 left-2 bg-red-500 text-white p-2 rounded z-10">
          Warning: No tiles available to render
        </div>
      ) : (
        <>
          <div className="absolute top-2 right-2 bg-blue-500 text-white p-2 rounded z-10">
            Tiles in map: {Object.keys(tileMap).length}
            <button 
              onClick={handleClearCache}
              className="ml-2 mt-1 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs"
            >
              Clear Cache
            </button>
          </div>
          <GridCanvas
            wireframe={false}
            hexSize={HEX_SIZE}
            tileMap={tileMap}
            onTileSelect={handleTileSelect}
            onCameraStop={handleCameraMove}
          />
        </>
      )}
      {isFetching && (
        <div className="absolute top-2 left-2 bg-yellow-500 text-black p-2 rounded z-10">
          Loading map area...
        </div>
      )}
    </div>
  );
}