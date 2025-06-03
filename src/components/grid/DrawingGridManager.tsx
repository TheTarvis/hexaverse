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
import { DrawingColorPicker } from '@/components/grid/DrawingColorPicker';
import { pixelToCube, cubeRound } from '@/utils/gridUtils';
import logger from '@/utils/logger';

// Constant for hex size
const HEX_SIZE = 1.2;
const VIEW_RADIUS = 100; // Number of tiles to render around camera view

export function DrawingGridManager() {
  const { user } = useAuth();
  const [tileMap, setTileMap] = useState<TileMap>({});
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([0, 0, 20]);

  // Keep track of initialization and preview state
  const hasInitializedRef = useRef(false);
  const originalTileColorsRef = useRef<Record<string, string>>({});
  const currentColorRef = useRef('#FF5252'); // Store current color in ref
  const serverTileCache = useRef<Record<string, Tile>>({}); // Cache of all server tiles

  // Generate tiles around a specific position (camera-based)
  const generateTilesAroundPosition = useCallback((centerX: number, centerY: number, radius: number = VIEW_RADIUS): TileMap => {
    const tiles: TileMap = {};
    
    // Convert center position to hex coordinates
    const [centerQ, centerR, centerS] = pixelToCube(centerX, centerY, HEX_SIZE);
    const [roundedQ, roundedR, roundedS] = cubeRound(centerQ, centerR, centerS);
    
    logger.info(`[DrawingGridManager] Generating tiles around camera position: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}) -> hex (${roundedQ}, ${roundedR}, ${roundedS})`);
    
    // Generate tiles in a hexagonal pattern around the center
    for (let q = roundedQ - radius; q <= roundedQ + radius; q++) {
      for (let r = Math.max(roundedR - radius, -q - roundedS - radius); r <= Math.min(roundedR + radius, -q - roundedS + radius); r++) {
        const s = -q - r;
        const tileId = `${q}#${r}#${s}`;
        
        // Check if we have this tile from server cache
        const serverTile = serverTileCache.current[tileId];
        
        tiles[tileId] = serverTile || {
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
    
    const tileCount = Object.keys(tiles).length;
    logger.info(`[DrawingGridManager] Generated ${tileCount} tiles around camera position`);
    return tiles;
  }, []);

  // Handle camera stop - regenerate visible tiles
  const handleCameraStop = useCallback((pos: [number, number, number]) => {
    logger.info('[DrawingGridManager] Camera stopped at position:', pos);
    setCameraPosition(pos);
    
    // Generate new tiles based on camera position
    const newTiles = generateTilesAroundPosition(pos[0], pos[1]);
    setTileMap(newTiles);
  }, [generateTilesAroundPosition]);

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
        // Step 1: Generate initial tiles around default camera position
        const initialTiles = generateTilesAroundPosition(0, 0);
        setTileMap(initialTiles);

        // Step 2: Fetch tiles since last update from server
        logger.info('[DrawingGridManager] Calling onLoadDrawingTiles...');
        const serverTiles = await onLoadDrawingTiles();
        logger.info(`[DrawingGridManager] Successfully loaded ${serverTiles.length} tiles from server`);

        // Step 3: Get all tiles from cache and store them
        const allCachedTiles = fetchAllDrawingTilesFromCache();
        logger.info(`[DrawingGridManager] Retrieved ${allCachedTiles.length} tiles from cache`);

        // Store all server tiles in cache for quick lookup
        allCachedTiles.forEach(tile => {
          if (tile.id) {
            serverTileCache.current[tile.id] = tile;
          }
        });

        // Step 4: Update current view with cached tiles
        setTileMap(prev => {
          const updatedTileMap = { ...prev };
          
          // Update visible tiles with cached data
          Object.keys(updatedTileMap).forEach(tileId => {
            if (serverTileCache.current[tileId]) {
              updatedTileMap[tileId] = serverTileCache.current[tileId];
            }
          });
          
          logger.info(`[DrawingGridManager] Updated visible tiles with cached data`);
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
  }, [generateTilesAroundPosition]);

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    logger.warn('[DrawingGridManager] Received WebSocket message:', message);
    
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
    // Early return if user is not logged in
    if (!user) {
      logger.info('[DrawingGridManager] handleTileSelect: User not logged in, ignoring tile selection');
      return;
    }

    logger.info('[DrawingGridManager] handleTileSelect called with tile:', tile);
    setSelectedTile(tile);
    
    const tileId = `${tile.q}#${tile.r}#${tile.s}`;
    
    if (tileMap[tileId]) {
      logger.info('[DrawingGridManager] Found tile, updating color to:', currentColorRef.current);
      
      // Create updated tile
      const updatedTile = {
        ...tileMap[tileId],
        color: currentColorRef.current
      };
      
      // Update UI immediately (optimistic update)
      setTileMap(prev => ({
        ...prev,
        [tileId]: updatedTile
      }));
      
      // Update server cache
      serverTileCache.current[tileId] = updatedTile;
      
      // Send to server
      onUpdateDrawingTile({
        q: tile.q,
        r: tile.r,
        s: tile.s,
        color: currentColorRef.current
      }).catch(error => {
        logger.error('[DrawingGridManager] Failed to update tile on server:', error);
        // TODO: Revert optimistic update on error
      });
    }
  }, [tileMap, user]);

  // Handle tile hover for preview
  const handleTileHover = useCallback((tile: Tile | null) => {
    // Early return if user is not logged in
    if (!user) {
      setHoveredTile(null);
      return;
    }

    if (!previewMode) {
      setHoveredTile(null);
      return;
    }

    if (tile) {
      setHoveredTile(tile);
      
      const tileId = `${tile.q}#${tile.r}#${tile.s}`;
      if (tileMap[tileId]) {
        // Store original color if not already stored
        if (!originalTileColorsRef.current[tileId]) {
          originalTileColorsRef.current[tileId] = tileMap[tileId].color || '#666666';
        }
        
        // Create updated tile with new color
        const updatedTile = {
          ...tileMap[tileId],
          color: currentColorRef.current,
          isPreview: true
        };
        
        // Update UI immediately
        setTileMap(prev => ({
          ...prev,
          [tileId]: updatedTile
        }));
        
        // Update server cache
        serverTileCache.current[tileId] = updatedTile;
        
        // Send update to server (paint on hover)
        onUpdateDrawingTile({
          q: tile.q,
          r: tile.r,
          s: tile.s,
          color: currentColorRef.current
        }).catch(error => {
          logger.error('[DrawingGridManager] Failed to update tile on hover:', error);
          
          // On error, revert to original color
          if (originalTileColorsRef.current[tileId]) {
            setTileMap(prev => ({
              ...prev,
              [tileId]: {
                ...prev[tileId],
                color: originalTileColorsRef.current[tileId],
                isPreview: false
              }
            }));
          }
        });
      }
    } else if (hoveredTile) {
      // Clear hover state when moving away from tile
      setHoveredTile(null);
      
      // Note: We no longer revert colors since the tile has been painted
      // The painted color should persist
    }
  }, [previewMode, tileMap, hoveredTile, user]);

  // Handle color change from color picker
  const handleColorChange = useCallback((color: string) => {
    logger.info('[DrawingGridManager] Color changed to:', color);
    currentColorRef.current = color;
    
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
        
        // Update server cache
        serverTileCache.current[tileId] = updatedTile;
        
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
            Visible tiles: {Object.keys(tileMap).length} | Camera: ({cameraPosition[0].toFixed(1)}, {cameraPosition[1].toFixed(1)}, {cameraPosition[2].toFixed(1)})
          </div>
          
          {/* Color Picker */}
          <DrawingColorPicker
            selectedTile={selectedTile}
            previewMode={previewMode}
            onColorChange={handleColorChange}
            onTogglePreviewMode={togglePreviewMode}
          />
          
          <GridCanvas
            wireframe={false}
            hexSize={HEX_SIZE}
            tileMap={tileMap}
            cameraPosition={cameraPosition}
            onTileSelect={handleTileSelect}
            onTileHover={handleTileHover}
            onCameraStop={handleCameraStop}
          />
        </>
      )}
    </div>
  );
}