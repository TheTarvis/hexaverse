'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useColony } from '@/contexts/ColonyContext'
import { useToast } from '@/contexts/ToastContext'
import { Tile } from '@/types/tiles'
import { DebugMenu } from '@/components/grid/DebugMenu'
import { GridCanvas, ViewableTile } from '@/components/grid/GridCanvas'
import { coordsToKey } from '@/utils/hexUtils'
import { getTileColor } from '@/utils/tileColorUtils'
import { addTile } from '@/services/tiles'
import { useViewDistance } from '@/hooks/useViewDistance'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAuth } from '@/contexts/AuthContext'
import { isTileMessage, isColonyMessage } from '@/types/websocket'

// Define colony status enum for better state management
enum ColonyStatus {
  LOADING = 'loading',
  HAS_TILES = 'has_tiles',
  HAS_TILE_IDS = 'has_tile_ids',
  NO_TILES = 'no_tiles',
  NO_COLONY = 'no_colony',
  ERROR = 'error'
}

interface TileMap {
  [key: string]: Tile
}

// Add an interface for the selected tile
interface SelectedTile {
  q: number;
  r: number;
  s: number;
  color: string;
  type?: string;
  resourceDensity?: number;
}

export function GridManager() {
  const { colony, refreshColony, setColony } = useColony();
  const { showToast } = useToast();
  const { user, userToken } = useAuth();
  
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type', // Default to type-based coloring
    viewDistance: 5, // Controls how many hex layers beyond the colony edge are shown as viewable tiles
    tileDetailsEnabled: false, // Disabled by default
    followSelectedTile: false, // Camera follow mode disabled by default
  })

  // Calculate world coordinates for the target tile based on colony start coordinates
  const worldCoords = useMemo(() => {
    if (!colony?.startCoordinates) {
      return { x: 0, y: 0 };
    }

    const { q, r } = colony.startCoordinates;
    const worldX = debugState.hexSize * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
    const worldY = debugState.hexSize * (3/2 * r);
    return { x: worldX, y: worldY };
  }, [colony?.startCoordinates, debugState.hexSize]);

  // Camera will be positioned directly above the target
  const cameraPosition: [number, number, number] = [worldCoords.x, worldCoords.y, 20];
  const cameraTarget: [number, number, number] = [worldCoords.x, worldCoords.y, 0];

  const [tileMap, setTileMap] = useState<TileMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const [addingTile, setAddingTile] = useState(false)
  const [colonyStatus, setColonyStatus] = useState<ColonyStatus>(ColonyStatus.LOADING)
  
  // Use the view distance hook to get base viewable tiles
  const { viewableTiles: baseViewableTiles } = useViewDistance(tileMap, debugState.viewDistance);
  
  // Process viewable tiles to include color
  const viewableTiles = useMemo(() => {
    return baseViewableTiles.map((tile: ViewableTile) => ({
      ...tile,
      color: getTileColor(
        'viewable', 
        debugState.colorScheme, 
        tile.q, 
        tile.r, 
        tile.s, 
        undefined, 
        tile.distance, 
        colony?.color,
        undefined,
        user?.uid
      )
    }));
  }, [baseViewableTiles, debugState.colorScheme, colony?.color, user?.uid]);
  
  // Update tile colors when colorScheme or other relevant parameters change
  useEffect(() => {
    if (Object.keys(tileMap).length === 0) return;
    
    const updatedTileMap = { ...tileMap };
    let hasChanges = false;
    
    // Update colors for all tiles based on current settings
    Object.entries(updatedTileMap).forEach(([key, tile]) => {
      const newColor = getTileColor(
        tile.type,
        debugState.colorScheme,
        tile.q,
        tile.r,
        tile.s,
        tile.resourceDensity,
        undefined,
        colony?.color,
        tile.controllerUid,
        user?.uid
      );
      
      // Only update if color has changed
      if (tile.color !== newColor) {
        updatedTileMap[key] = {
          ...tile,
          color: newColor
        };
        hasChanges = true;
      }
    });
    
    // Only update state if colors have actually changed
    if (hasChanges) {
      setTileMap(updatedTileMap);
    }
  }, [debugState.colorScheme, colony?.color, user?.uid]);

  // Helper function to check if tileMap has tiles
  const hasTiles = useCallback((map: TileMap): boolean => {
    return Object.keys(map).length > 0;
  }, []);

  // Create a new tile map from the colony's tiles
  const createTileMapFromColony = useCallback((colonyTiles: Tile[]): TileMap => {
    const newTileMap: TileMap = {};
    colonyTiles.forEach((tile) => {
      const key = coordsToKey(tile.q, tile.r, tile.s);
      newTileMap[key] = tile;
    });
    return newTileMap;
  }, []);

  // Check if we should update the tile map based on changes
  const shouldUpdateTileMap = useCallback((prevTileMap: TileMap, newTileMap: TileMap): boolean => {
    const prevKeys = Object.keys(prevTileMap);
    const newKeys = Object.keys(newTileMap);
    
    // Different number of keys means we need to update
    if (prevKeys.length !== newKeys.length || newKeys.some(key => !prevTileMap[key])) {
      return true;
    }
    
    // Check if any tiles have different data
    return newKeys.some(key => {
      const prevTile = prevTileMap[key];
      const newTile = newTileMap[key];
      return JSON.stringify(prevTile) !== JSON.stringify(newTile);
    });
  }, []);
  
  // WebSocket integration
  const handleWebSocketMessage = useCallback((data: any) => {
    console.log(`WebSocket: Received message`, data);
    
    // Handle tile updates
    if (isTileMessage(data)) {
      const tile = data.payload as Tile;
      const tileKey = coordsToKey(tile.q, tile.r, tile.s);
      
      console.log(`WebSocket: Received tile update for ${tileKey}`, tile);
      
      // Update the tile map with the new tile data
      setTileMap(prevTileMap => {
        // Create a copy of the tile for potential modifications
        let updatedTile = { ...tile };
        
        // Check if the tile is within view distance
        const isInViewDistance = baseViewableTiles.some(
          (viewTile: ViewableTile) => viewTile.q === tile.q && viewTile.r === tile.r && viewTile.s === tile.s
        );
        
        // Check if the tile is owned by another player
        const isEnemyTile = tile.controllerUid && tile.controllerUid !== userToken;
        
        if (isEnemyTile) {
          console.log(`WebSocket: Tile ${tileKey} is controlled by another player (${tile.controllerUid})`);
          console.log(`WebSocket: Current userToken=${userToken}`);
          console.log(`WebSocket: isInViewDistance=${isInViewDistance}`);
        }
        
        // Add the tile color based on its properties
        updatedTile.color = getTileColor(
          updatedTile.type,
          debugState.colorScheme,
          updatedTile.q,
          updatedTile.r,
          updatedTile.s,
          updatedTile.resourceDensity,
          undefined,
          colony?.color,
          updatedTile.controllerUid,
          user?.uid
        );
        
        // Only add/update the tile if:
        // 1. It's already in our tileMap (we already know about it), or
        // 2. It's in view distance (we can see it)
        if (prevTileMap[tileKey] || isInViewDistance) {
          // For enemy tiles in view distance, keep the controllerUid property
          // so GridCanvas can color them appropriately
          
          // Check if this is an update to an existing tile or a new tile
          const tileExists = prevTileMap[tileKey] !== undefined;
          const tileHasChanged = JSON.stringify(prevTileMap[tileKey]) !== JSON.stringify(updatedTile);
          
          // Log more details for debugging
          if (isEnemyTile && isInViewDistance) {
            console.log(`WebSocket: Adding enemy tile to tileMap with controllerUid=${updatedTile.controllerUid}`);
          }
          
          // Only update if the tile is new or has changed
          if (!tileExists || tileHasChanged) {
            console.log(`WebSocket: Updating tile ${tileKey} in tileMap`);
            return {
              ...prevTileMap,
              [tileKey]: updatedTile
            };
          }
        } else {
          console.log(`WebSocket: Tile ${tileKey} is not within view distance, not adding to tileMap`);
        }
        
        return prevTileMap;
      });
    }
    
    // Handle colony updates
    if (isColonyMessage(data) && colony && data.payload.id === colony.id) {
      console.log(`WebSocket: Received colony update`, data.payload);
    }
  }, [colony, baseViewableTiles, user?.uid, debugState.colorScheme]);
  
  // Initialize WebSocket connection
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    autoConnect: true,
    token: userToken
  });
  
  // Update colony status when colony changes
  useEffect(() => {
    if (colony === null && loading) {
      setColonyStatus(ColonyStatus.LOADING);
    } else if (colony === null) {
      setColonyStatus(ColonyStatus.NO_COLONY);
    } else if (colony.tiles && colony.tiles.length > 0) {
      setColonyStatus(ColonyStatus.HAS_TILES);
    } else if (colony.tileIds && colony.tileIds.length > 0) {
      setColonyStatus(ColonyStatus.HAS_TILE_IDS);
    } else {
      setColonyStatus(ColonyStatus.NO_TILES);
    }
  }, [colony, loading]);

  // Handle the case when a colony has tiles
  const handleColonyWithTiles = useCallback((colonyTiles: Tile[]) => {
    console.log(`Loading ${colonyTiles.length} tiles from colony`);
    
    // Add colors to tiles before creating the tile map
    const coloredTiles = colonyTiles.map(tile => ({
      ...tile,
      color: getTileColor(
        tile.type,
        debugState.colorScheme,
        tile.q,
        tile.r,
        tile.s,
        tile.resourceDensity,
        undefined,
        colony?.color,
        tile.controllerUid,
        user?.uid
      )
    }));
    
    const newTileMap = createTileMapFromColony(coloredTiles);
    
    // Only update state if we actually have changes
    setTileMap(prevTileMap => {
      return shouldUpdateTileMap(prevTileMap, newTileMap) ? newTileMap : prevTileMap;
    });
    
    setError(null);
    setLoading(false);
  }, [createTileMapFromColony, shouldUpdateTileMap, debugState.colorScheme, colony?.color, user?.uid]);

  // Handle the case when a colony has tileIds but no tiles yet
  const handleColonyWithTileIds = useCallback(() => {
    console.log(`Colony has ${colony?.tileIds?.length} tiles, but they aren't loaded yet`);
    setError(null);
    // Loading state remains true until tiles are loaded
  }, [colony?.tileIds?.length]);

  // Handle the case when a colony has no tiles
  const handleColonyWithNoTiles = useCallback((hasExistingTiles: boolean) => {
    console.log('Colony exists but has no tiles');
    
    // Keep existing tiles if we have them during reload
    if (!hasExistingTiles) {
      setTileMap({});
    }
    
    setError('No colony tiles available. Please create a colony first.');
    setLoading(false);
  }, []);

  // Handle the case when there's no colony
  const handleNoColony = useCallback(() => {
    console.log('No colony available');
    setTileMap({});
    setError('No colony available. Please create a colony first.');
    setLoading(false);
  }, []);

  // Load grid data function hoisted outside the useEffect
  const loadGridData = useCallback(async () => {
    try {
      // Don't set loading to true if we already have tiles - this prevents flickering
      const hasExistingTiles = hasTiles(tileMap);
      if (!hasExistingTiles) {
        setLoading(true);
      }
      
      // Use the colonyStatus to determine what to do
      switch (colonyStatus) {
        case ColonyStatus.HAS_TILES:
          if (colony?.tiles) {
            handleColonyWithTiles(colony.tiles);
          }
          break;
        case ColonyStatus.HAS_TILE_IDS:
          // TODO TW: Handle this case, should remove, but it's not needed for now.
          handleColonyWithTileIds();
          break;
        case ColonyStatus.NO_TILES:
          handleColonyWithNoTiles(hasExistingTiles);
          break;
        case ColonyStatus.NO_COLONY:
          handleNoColony();
          break;
        case ColonyStatus.LOADING:
          // Do nothing while loading
          console.log('Waiting for colony data to load...');
          break;
        case ColonyStatus.ERROR:
          // Already handled by the error state
          break;
      }
    } catch (error) {
      console.error('Error loading grid data:', error);
      setError('Failed to load grid data');
      setLoading(false);
      setColonyStatus(ColonyStatus.ERROR);
    } finally {
      // Only set loading to false if we have tiles or we hit an error condition
      if (hasTiles(tileMap) || error) {
        setLoading(false);
      }
    }
  }, [colonyStatus, colony, tileMap, hasTiles, handleColonyWithTiles, handleColonyWithTileIds, handleColonyWithNoTiles, handleNoColony]);

  // Only call loadGridData when colonyStatus changes or on initial load
  useEffect(() => {
    loadGridData();
  }, [colonyStatus, colony?.id]); // Only re-run when colony status or colony ID changes
  
  // Add debug information about WebSocket connection
  useEffect(() => {
    console.log(`WebSocket connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
  }, [isConnected]);
  
  // Combined useEffect for error toast only
  useEffect(() => {
    // Show toast only when we have a confirmed error, not during loading
    if (error) {
      showToast(error, 'error');
    }
  }, [error, showToast]);
  
  // Handle adding a tile to the colony
  const handleAddTile = useCallback(async (q: number, r: number, s: number) => {
    if (addingTile) return; // Prevent multiple concurrent requests
    
    try {
      setAddingTile(true);
      console.log(`Adding tile at q=${q}, r=${r}, s=${s} to colony`);
      
      const result = await addTile(q, r, s);
      
      if (result.success && result.tile) {
        // Get the new tile from the result
        const newTile = result.tile as Tile;
        const tileKey = coordsToKey(q, r, s);
        
        // Add color to the new tile
        const coloredTile = {
          ...newTile,
          color: getTileColor(
            newTile.type,
            debugState.colorScheme,
            newTile.q,
            newTile.r,
            newTile.s,
            newTile.resourceDensity,
            undefined,
            colony?.color,
            newTile.controllerUid,
            user?.uid
          )
        };
        
        // Add the new tile to the local tile map immediately for immediate feedback
        // This needs to happen before we update the colony
        setTileMap(prevTileMap => {
          const updatedMap = { ...prevTileMap };
          updatedMap[tileKey] = coloredTile;
          return updatedMap;
        });
        
        // Clone the current colony and update it directly to prevent race conditions
        // and ensure consistency between grid and colony data
        if (colony) {
          // This is a separate update from the local tileMap update
          // to ensure both state objects are consistent
          setColony(prevColony => {
            if (!prevColony) return prevColony;
            
            // Clone the colony to avoid mutation
            const updatedColony = { ...prevColony };
            
            // Ensure tileIds array exists
            if (!updatedColony.tileIds) {
              updatedColony.tileIds = [];
            }
            
            // Ensure tiles array exists
            if (!updatedColony.tiles) {
              updatedColony.tiles = [];
            }
            
            // Add the new tile ID if it doesn't already exist
            if (!updatedColony.tileIds.includes(coloredTile.id)) {
              updatedColony.tileIds = [...updatedColony.tileIds, coloredTile.id];
            }
            
            // Check if the tile already exists in the tiles array
            const existingTileIndex = updatedColony.tiles.findIndex(
              t => t.id === coloredTile.id || (t.q === coloredTile.q && t.r === coloredTile.r && t.s === coloredTile.s)
            );
            
            if (existingTileIndex >= 0) {
              // Replace the existing tile
              const updatedTiles = [...updatedColony.tiles];
              updatedTiles[existingTileIndex] = coloredTile;
              updatedColony.tiles = updatedTiles;
            } else {
              // Add the new tile
              updatedColony.tiles = [...updatedColony.tiles, coloredTile];
            }
            
            return updatedColony;
          });
        }
        
        // Log success but don't show toast
        if (result.captured) {
          console.log(`Tile captured from another colony!`);
        } else {
          console.log(`New ${result.tile.type} tile added to your colony!`);
        }
        
        // We don't need to refresh the colony as our direct updates are sufficient
        // and the background refresh was causing issues with tiles disappearing
      } else {
        // Show error toast
        console.error(`Failed to add tile: ${result.message}`);
        showToast(result.message || "Failed to add tile", 'error');
        setError(null); // Clear any existing error
      }
    } catch (error) {
      console.error('Error adding tile:', error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      showToast(errorMessage, 'error');
      setError(null); // Clear any existing error
    } finally {
      setAddingTile(false);
    }
  }, [addingTile, colony, setColony, showToast, debugState.colorScheme, user?.uid]);
  
  const handleDebugAction = (action: string, value?: any) => {
    switch(action) {
      case 'toggleWireframe':
        setDebugState((prev) => ({ ...prev, wireframe: !prev.wireframe }))
        break
      case 'adjustSize':
        setDebugState((prev) => ({ 
          ...prev, 
          hexSize: prev.hexSize === 1.2 ? 1.5 : prev.hexSize === 1.5 ? 0.9 : 1.2
        }))
        break
      case 'changeColorScheme':
        setDebugState((prev) => {
          const schemes = ['type', 'resources', 'rainbow', 'colony', 'default', 'monochrome'];
          const currentIndex = schemes.indexOf(prev.colorScheme);
          const nextIndex = (currentIndex + 1) % schemes.length;
          return { ...prev, colorScheme: schemes[nextIndex] };
        });
        break;
      case 'changeViewDepth': // Add case for changing view depth
        if (typeof value === 'number' && value >= 0) {
          setDebugState((prev) => ({ ...prev, viewDistance: value }));
        }
        break;
      case 'toggleTileDetails': // Add case for toggling tile details
        setDebugState((prev) => ({ ...prev, tileDetailsEnabled: !prev.tileDetailsEnabled }));
        // If disabling and a tile is selected, close the panel
        if (debugState.tileDetailsEnabled && selectedTile) {
          setSelectedTile(null);
        }
        break;
      case 'toggleCameraFollow': // Add case for toggling camera follow mode
        setDebugState((prev) => ({ ...prev, followSelectedTile: !prev.followSelectedTile }));
        break;
    }
  }

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Setting selected tile:', tile);
    // Only set the selected tile if tile details are enabled
    if (debugState.tileDetailsEnabled) {
      setSelectedTile(tile);
    } else {
      console.log('Tile details are disabled. Enable in debug menu to see details.');
    }
  }

  const closePanel = () => {
    setSelectedTile(null);
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-950 bg-opacity-70 absolute inset-0 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="mt-4 text-gray-700 dark:text-gray-300">Loading grid data...</p>
          </div>
        </div>
      )}
      
      {/* Enhanced SlideUpPanel with more tile information - only show if enabled */}
      <SlideUpPanel
        isOpen={selectedTile !== null && debugState.tileDetailsEnabled}
        onClose={closePanel}
        title="Tile Information"
        maxWidth="lg"
        showOverlay={false}
        closeOnOutsideClick={false}
      >
        {selectedTile && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Cube Coordinates</div>
              <div className="font-mono mt-1 dark:text-gray-200">
                q: {selectedTile.q}, r: {selectedTile.r}, s: {selectedTile.s}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</div>
              <div className="flex items-center mt-1">
                <div 
                  className="h-6 w-6 rounded mr-2" 
                  style={{ backgroundColor: selectedTile.color }}
                ></div>
                <code className="text-xs dark:text-gray-200">{selectedTile.color}</code>
              </div>
            </div>
            {selectedTile.type && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Tile Type</div>
                <div className="mt-1 dark:text-gray-200">
                  {selectedTile.type}
                </div>
              </div>
            )}
            {selectedTile.resourceDensity !== undefined && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Resource Density</div>
                <div className="mt-1 dark:text-gray-200">
                  {Math.round(selectedTile.resourceDensity * 100)}%
                </div>
              </div>
            )}
          </div>
        )}
      </SlideUpPanel>
      
      {/* Debug Menu Component - pass view depth and handler */}
      <DebugMenu 
        debugState={debugState} 
        onDebugAction={handleDebugAction} 
      />

      {/* Show error message if there's an error and we're not loading */}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-40 z-10">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg max-w-md">
            <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">Error</h3>
            <p className="text-gray-700 dark:text-gray-300">{error}</p>
          </div>
        </div>
      )}
      
      {/* Only render the Canvas when not loading, no errors, and we have tiles */}
      {!loading && !error && Object.keys(tileMap).length > 0 && (
        <GridCanvas
          wireframe={debugState.wireframe}
          hexSize={debugState.hexSize}
          tileMap={tileMap}
          viewTiles={viewableTiles}
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          onTileSelect={handleTileSelect}
          onTileAdd={handleAddTile}
          followSelectedTile={debugState.followSelectedTile}
        />
      )}
    </div>
  )
} 