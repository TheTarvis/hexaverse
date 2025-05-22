'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { HexColorPicker } from '@/components/grid/HexColorPicker';

// Constant for hex size
const HEX_SIZE = 1.2; // Make sure this matches GridCanvas prop

export function DrawingGridManager() {
  const { user } = useAuth();
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);
  const [selectedColor, setSelectedColor] = useState('#FF5252'); // Default color
  const [previewMode, setPreviewMode] = useState(false); // Preview mode disabled by default

  // Keep track of default tiles and initialization
  const defaultTilesRef = useRef<TileMap>({});
  const hasInitializedRef = useRef(false);
  const originalTileColorsRef = useRef<Record<string, string>>({});

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
        if (isMounted) {
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
        // Don't reset initialization flag on error to prevent infinite retries
      }
    };

    fetchInitialTiles();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

  const handleTileSelect = (tile: Tile) => {
    console.log('[DrawingGridManager] handleTileSelect called with tile:', tile);
    setSelectedTile(tile);
    
    // Construct tile ID based on coordinates
    const tileId = `${tile.q}#${tile.r}#${tile.s}`;
    console.log('[DrawingGridManager] Looking for tile with ID:', tileId);
    
    // Check if the tile exists before updating
    if (tileMap[tileId]) {
      console.log('[DrawingGridManager] Found tile, updating color to:', selectedColor);
      // Preserve existing tile data when updating color
      const existingTile = tileMap[tileId];
      const updatedTile = {
        ...existingTile,
        color: selectedColor
      };
      // Update the tile with the new color while preserving other properties
      updateTile(tileId, updatedTile);
      onUpdateDrawingTile({
        q: tile.q,
        r: tile.r,
        s: tile.s,
        color: selectedColor
      });
    } else {
      console.log('[DrawingGridManager] Tile not found in tileMap, cannot update color');
    }
  }

  const handleTileHover = (tile: Tile | null) => {
    // Skip if preview mode is disabled
    if (!previewMode) {
      setHoveredTile(null);
      return;
    }

    if (tile) {
      setHoveredTile(tile);
      
      // Save original color if not already saved
      const tileId = `${tile.q}#${tile.r}#${tile.s}`;
      if (tileMap[tileId] && !originalTileColorsRef.current[tileId]) {
        originalTileColorsRef.current[tileId] = tileMap[tileId].color || '#666666';
      }
      
      // Update with preview color
      if (tileMap[tileId]) {
        updateTile(tileId, {
          ...tileMap[tileId],
          color: selectedColor,
          isPreview: true // Mark as preview so we don't save this change
        });
      }
    } else if (hoveredTile) {
      // Restore original color when not hovering anymore
      const prevTileId = `${hoveredTile.q}#${hoveredTile.r}#${hoveredTile.s}`;
      if (tileMap[prevTileId] && tileMap[prevTileId].isPreview && originalTileColorsRef.current[prevTileId]) {
        updateTile(prevTileId, {
          ...tileMap[prevTileId],
          color: originalTileColorsRef.current[prevTileId],
          isPreview: false
        });
        
        // Clean up the saved color
        delete originalTileColorsRef.current[prevTileId];
      }
      
      setHoveredTile(null);
    }
  };

  const handleColorSelect = (color: string) => {
    console.log('[DrawingGridManager] Selected color:', color);
    setSelectedColor(color);
    
    // If a tile is already selected, update it with the new color
    if (selectedTile) {
      const tileId = `${selectedTile.q}#${selectedTile.r}#${selectedTile.s}`;
      if (tileMap[tileId]) {
        const existingTile = tileMap[tileId];
        const updatedTile = {
          ...existingTile,
          color
        };
        updateTile(tileId, updatedTile);
        onUpdateDrawingTile({
          q: selectedTile.q,
          r: selectedTile.r,
          s: selectedTile.s,
          color
        });
      }
    }
  };

  const togglePreviewMode = () => {
    setPreviewMode(!previewMode);
    
    // If turning off preview mode and there's a hovered tile, restore its original color
    if (previewMode && hoveredTile) {
      const tileId = `${hoveredTile.q}#${hoveredTile.r}#${hoveredTile.s}`;
      if (tileMap[tileId] && tileMap[tileId].isPreview && originalTileColorsRef.current[tileId]) {
        updateTile(tileId, {
          ...tileMap[tileId],
          color: originalTileColorsRef.current[tileId],
          isPreview: false
        });
        
        // Clean up saved colors
        delete originalTileColorsRef.current[tileId];
      }
      
      setHoveredTile(null);
    }
  };

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
            {/* <button 
              onClick={handleClearCache}
              className="ml-2 mt-1 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs"
            >
              Clear Cache
            </button> */}
          </div>
          
          {/* Color Picker */}
          <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-zinc-800 rounded-lg shadow-md p-4">
            <HexColorPicker 
              onColorSelect={handleColorSelect} 
              initialColor={selectedColor}
            />
            <div className="text-center mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {selectedTile ? `Editing tile at (${selectedTile.q},${selectedTile.r})` : 'Select a tile to paint'}
            </div>
            <div className="flex justify-center mt-2">
              <button 
                onClick={togglePreviewMode}
                className={`px-3 py-1 text-xs rounded-full ${
                  previewMode 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {previewMode ? 'Hover Preview On' : 'Hover Preview Off'}
              </button>
            </div>
          </div>
          
          <GridCanvas
            wireframe={false}
            hexSize={HEX_SIZE}
            tileMap={tileMap}
            onTileSelect={handleTileSelect}
            onCameraStop={handleCameraMove}
            onTileHover={handleTileHover}
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