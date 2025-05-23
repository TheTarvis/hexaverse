'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GridCanvas } from '@/components/grid/GridCanvas'
import { useAuth } from '@/contexts/AuthContext'
import { Tile, TileMap } from '@/types/tiles';
import { 
  onLoadDrawingTiles,
  onUpdateDrawingTile,
  updateLocalTileCache,
  fetchAllDrawingTilesFromCache
} from '@/services/DrawingTilesService';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { WebSocketMessage } from '@/types/websocket'
import { HexColorPicker } from '@/components/grid/HexColorPicker';
import logger from '@/utils/logger';

// Constant for hex size
const HEX_SIZE = 1.2;
const GRID_RADIUS = 100;

export function DrawingGridManager() {
  const { user } = useAuth();
  const [tileMap, setTileMap] = useState<TileMap>({});
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);
  const [selectedColor, setSelectedColor] = useState('#FF5252');
  const [previewMode, setPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Keep track of initialization and preview state
  const hasInitializedRef = useRef(false);
  const originalTileColorsRef = useRef<Record<string, string>>({});

  // Generate default tiles in a grid pattern
  const generateDefaultTiles = useCallback((radius: number = GRID_RADIUS): TileMap => {
    const tiles: TileMap = {};
    
    for (let q = -radius; q <= radius; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
        const s = -q - r;
        const tileId = `${q}#${r}#${s}`;
        tiles[tileId] = {
          id: tileId,
          q,
          r,
          s,
          color: '#666666', // Default gray color
          controllerUid: '',
          updatedAt: new Date().toISOString()
        };
      }
    }
    
    logger.info(`[DrawingGridManager] Generated ${Object.keys(tiles).length} default tiles`);
    return tiles;
  }, []);

  // Initialize the grid following the sequence diagram
  useEffect(() => {
    let isMounted = true;

    const initializeGrid = async () => {
      if (hasInitializedRef.current || !isMounted) {
        logger.info('[DrawingGridManager] Skipping initialization - already initialized or unmounted');
        return;
      }

      logger.info('[DrawingGridManager] Starting grid initialization...');
      setIsLoading(true);

      try {
        // Step 1: Generate default tiles for display
        const defaultTiles = generateDefaultTiles();
        setTileMap(defaultTiles);

        // Step 2: Fetch tiles since last update from server
        logger.info('[DrawingGridManager] Calling onLoadDrawingTiles...');
        const serverTiles = await onLoadDrawingTiles();
        logger.info(`[DrawingGridManager] Successfully loaded ${serverTiles.length} tiles from server`);

        // Step 3: Get all tiles from cache (which now includes the new tiles from server)
        const allCachedTiles = fetchAllDrawingTilesFromCache();
        logger.info(`[DrawingGridManager] Retrieved ${allCachedTiles.length} tiles from cache`);

        // Step 4: Update tileMap with cached tiles (merge with defaults)
        setTileMap(prev => {
          const updatedTileMap = { ...prev };
          
          // Update with cached tiles, preserving default tiles for areas without data
          allCachedTiles.forEach(tile => {
            if (tile.id) {
              updatedTileMap[tile.id] = tile;
            }
          });
          
          logger.info(`[DrawingGridManager] Updated tileMap with ${allCachedTiles.length} cached tiles`);
          return updatedTileMap;
        });

        hasInitializedRef.current = true;
        setIsLoading(false);
        logger.info('[DrawingGridManager] Grid initialization complete');
      } catch (error) {
        logger.error('[DrawingGridManager] Error during grid initialization:', error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeGrid();

    return () => {
      isMounted = false;
    };
  }, [generateDefaultTiles]);

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    logger.info('[DrawingGridManager] Received WebSocket message:', message);
    
    // TODO: Add proper message type checking
    const tile = message as Tile;
    if (tile.id) {
      logger.info('[DrawingGridManager] Processing tile update:', tile);
      
      // Update local cache
      updateLocalTileCache(tile);
      
      // Update tile map
      setTileMap(prev => ({
        ...prev,
        [tile.id]: tile
      }));
    }
  }, []);

  // Subscribe to WebSocket messages
  useWebSocketSubscription({
    onMessage: handleWebSocketMessage
  });

  // Handle tile selection for painting
  const handleTileSelect = useCallback((tile: Tile) => {
    logger.info('[DrawingGridManager] handleTileSelect called with tile:', tile);
    setSelectedTile(tile);
    
    const tileId = `${tile.q}#${tile.r}#${tile.s}`;
    
    if (tileMap[tileId]) {
      logger.info('[DrawingGridManager] Found tile, updating color to:', selectedColor);
      
      // Create updated tile
      const updatedTile = {
        ...tileMap[tileId],
        color: selectedColor
      };
      
      // Update UI immediately (optimistic update)
      setTileMap(prev => ({
        ...prev,
        [tileId]: updatedTile
      }));
      
      // Send to server
      onUpdateDrawingTile({
        q: tile.q,
        r: tile.r,
        s: tile.s,
        color: selectedColor
      }).catch(error => {
        logger.error('[DrawingGridManager] Failed to update tile on server:', error);
        // TODO: Revert optimistic update on error
      });
    }
  }, [selectedColor, tileMap]);

  // Handle tile hover for preview
  const handleTileHover = useCallback((tile: Tile | null) => {
    if (!previewMode) {
      setHoveredTile(null);
      return;
    }

    if (tile) {
      setHoveredTile(tile);
      
      const tileId = `${tile.q}#${tile.r}#${tile.s}`;
      if (tileMap[tileId] && !originalTileColorsRef.current[tileId]) {
        originalTileColorsRef.current[tileId] = tileMap[tileId].color || '#666666';
      }
      
      if (tileMap[tileId]) {
        setTileMap(prev => ({
          ...prev,
          [tileId]: {
            ...prev[tileId],
            color: selectedColor,
            isPreview: true
          }
        }));
      }
    } else if (hoveredTile) {
      const prevTileId = `${hoveredTile.q}#${hoveredTile.r}#${hoveredTile.s}`;
      if (tileMap[prevTileId] && tileMap[prevTileId].isPreview && originalTileColorsRef.current[prevTileId]) {
        setTileMap(prev => ({
          ...prev,
          [prevTileId]: {
            ...prev[prevTileId],
            color: originalTileColorsRef.current[prevTileId],
            isPreview: false
          }
        }));
        
        delete originalTileColorsRef.current[prevTileId];
      }
      
      setHoveredTile(null);
    }
  }, [previewMode, selectedColor, tileMap]);

  // Handle color selection
  const handleColorSelect = useCallback((color: string) => {
    logger.info('[DrawingGridManager] Selected color:', color);
    setSelectedColor(color);
    
    if (selectedTile) {
      const tileId = `${selectedTile.q}#${selectedTile.r}#${selectedTile.s}`;
      if (tileMap[tileId]) {
        const updatedTile = {
          ...tileMap[tileId],
          color
        };
        
        setTileMap(prev => ({
          ...prev,
          [tileId]: updatedTile
        }));
        
        onUpdateDrawingTile({
          q: selectedTile.q,
          r: selectedTile.r,
          s: selectedTile.s,
          color
        });
      }
    }
  }, [selectedTile, tileMap]);

  // Toggle preview mode
  const togglePreviewMode = useCallback(() => {
    setPreviewMode(prev => !prev);
    
    if (previewMode && hoveredTile) {
      const tileId = `${hoveredTile.q}#${hoveredTile.r}#${hoveredTile.s}`;
      if (tileMap[tileId] && tileMap[tileId].isPreview && originalTileColorsRef.current[tileId]) {
        setTileMap(prev => ({
          ...prev,
          [tileId]: {
            ...prev[tileId],
            color: originalTileColorsRef.current[tileId],
            isPreview: false
          }
        }));
        
        delete originalTileColorsRef.current[tileId];
      }
      
      setHoveredTile(null);
    }
  }, [previewMode, hoveredTile, tileMap]);

  return (
    <div className="relative h-full w-full">
      {isLoading ? (
        <div className="absolute top-2 left-2 bg-yellow-500 text-black p-2 rounded z-10">
          Initializing drawing grid...
        </div>
      ) : Object.keys(tileMap).length === 0 ? (
        <div className="absolute top-2 left-2 bg-red-500 text-white p-2 rounded z-10">
          Warning: No tiles available to render
        </div>
      ) : (
        <>
          <div className="absolute top-2 right-2 bg-blue-500 text-white p-2 rounded z-10">
            Tiles in map: {Object.keys(tileMap).length}
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
            onTileHover={handleTileHover}
            onCameraStop={() => {}}
          />
        </>
      )}
    </div>
  );
}