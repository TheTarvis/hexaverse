'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useColony } from '@/contexts/ColonyContext'
import { useToast } from '@/contexts/ToastContext'
import { ColonyTile } from '@/types/colony'
import { DebugMenu } from '@/components/grid/DebugMenu'
import { FogTile, HexGridCanvas } from '@/components/grid/HexGridCanvas'
import { coordsToKey, findFogTiles } from '@/utils/hexUtils'
import { addTile } from '@/services/tiles'

interface TileMap {
  [key: string]: ColonyTile
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
  
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type', // Default to type-based coloring
    fogDistance: 5, // Add fog distance to debug state
    tileDetailsEnabled: false, // Disabled by default
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
  const [fogTiles, setFogTiles] = useState<FogTile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const [addingTile, setAddingTile] = useState(false)
  
  // Recalculate fog tiles when fog depth changes or tileMap is updated
  useEffect(() => {
    if (Object.keys(tileMap).length > 0) {
      // Find fog tiles based on current depth
      const fogTilesList = findFogTiles(tileMap, debugState.fogDistance);
      console.log(`Found ${fogTilesList.length} potential fog tiles with depth ${debugState.fogDistance}`);
      setFogTiles(fogTilesList);
    }
  }, [tileMap, debugState.fogDistance]); // TODO TW: Figure out this warning.

  // Load the initial grid data when colony tiles change
  useEffect(() => {
    async function loadGridData() {
      try {
        // Don't set loading to true if we already have tiles - this prevents flickering
        const hasExistingTiles = Object.keys(tileMap).length > 0;
        if (!hasExistingTiles) {
          setLoading(true);
        }
        
        if (colony) {
          if (colony.tiles && colony.tiles.length > 0) {
            console.log(`Loading ${colony.tiles.length} tiles from colony`);
            
            // Create a map of all new tiles
            const newTileMap: TileMap = {};
            
            // To ensure we don't lose our newly added tiles, merge with existing tileMap
            colony.tiles.forEach((tile) => {
              const key = coordsToKey(tile.q, tile.r, tile.s);
              newTileMap[key] = tile;
            });
            
            // Only update state if we actually have changes
            setTileMap(prevTileMap => {
              // Compare if we have the same keys to avoid unnecessary rerenders
              const prevKeys = Object.keys(prevTileMap);
              const newKeys = Object.keys(newTileMap);
              
              if (prevKeys.length !== newKeys.length || 
                  newKeys.some(key => !prevTileMap[key])) {
                // We have different keys, so update the map
                return newTileMap;
              }
              
              // Check if any tiles have different data
              const hasChanges = newKeys.some(key => {
                const prevTile = prevTileMap[key];
                const newTile = newTileMap[key];
                return JSON.stringify(prevTile) !== JSON.stringify(newTile);
              });
              
              return hasChanges ? newTileMap : prevTileMap;
            });
            
            setError(null);
          } else if (colony.tileIds && colony.tileIds.length > 0) {
            // We have a colony with tileIds but tiles aren't loaded yet
            // Keep loading state true and don't show an error
            console.log(`Colony has ${colony.tileIds.length} tiles, but they aren't loaded yet`);
            setError(null);
            // Loading state remains true until tiles are loaded
          } else {
            // Only show the "No colony tiles" error if we've finished loading and there are no tileIds
            console.log('Colony exists but has no tiles');
            
            // Keep existing tiles if we have them during reload
            if (!hasExistingTiles) {
              setTileMap({});
              setFogTiles([]); // Clear fog tiles if no colony
            }
            
            setError('No colony tiles available. Please create a colony first.');
            setLoading(false);
          }
        } else if (loading && colony === null) {
          // Colony is still loading or being checked, don't show an error yet
          console.log('Waiting for colony data to load...');
        } else {
          // Colony is definitely not available (finished loading and is null)
          console.log('No colony available');
          setTileMap({});
          setFogTiles([]);
          setError('No colony available. Please create a colony first.');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading grid data:', error);
        setError('Failed to load grid data');
        setLoading(false);
      } finally {
        // Only set loading to false if we have tiles or we hit an error condition
        if (Object.keys(tileMap).length > 0 || error) {
          setLoading(false);
        }
      }
    }
    
    loadGridData();
  }, [colony, loading, tileMap, error]); // Added tileMap as a dependency to properly handle changes
  
  // Show toast only when we have a confirmed error, not during loading
  useEffect(() => {
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
        const newTile = result.tile as ColonyTile;
        const tileKey = coordsToKey(q, r, s);
        
        // Add the new tile to the local tile map immediately for immediate feedback
        // This needs to happen before we update the colony
        setTileMap(prevTileMap => {
          const updatedMap = { ...prevTileMap };
          updatedMap[tileKey] = newTile;
          return updatedMap;
        });
        
        // Remove this tile from fog tiles since it's now part of the colony
        setFogTiles(prevFogTiles => 
          prevFogTiles.filter(tile => !(tile.q === q && tile.r === r && tile.s === s))
        );
        
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
            if (!updatedColony.tileIds.includes(newTile.id)) {
              updatedColony.tileIds = [...updatedColony.tileIds, newTile.id];
            }
            
            // Check if the tile already exists in the tiles array
            const existingTileIndex = updatedColony.tiles.findIndex(
              t => t.id === newTile.id || (t.q === newTile.q && t.r === newTile.r && t.s === newTile.s)
            );
            
            if (existingTileIndex >= 0) {
              // Replace the existing tile
              const updatedTiles = [...updatedColony.tiles];
              updatedTiles[existingTileIndex] = newTile;
              updatedColony.tiles = updatedTiles;
            } else {
              // Add the new tile
              updatedColony.tiles = [...updatedColony.tiles, newTile];
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
  }, [addingTile, colony, refreshColony, setColony, setFogTiles, showToast]); // Added colony back as a dependency
  
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
      case 'changeFogDepth': // Add case for changing fog depth
        if (typeof value === 'number' && value >= 0) {
          setDebugState((prev) => ({ ...prev, fogDepth: value }));
        }
        break;
      case 'toggleTileDetails': // Add case for toggling tile details
        setDebugState((prev) => ({ ...prev, tileDetailsEnabled: !prev.tileDetailsEnabled }));
        // If disabling and a tile is selected, close the panel
        if (debugState.tileDetailsEnabled && selectedTile) {
          setSelectedTile(null);
        }
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
      
      {/* Debug Menu Component - pass fogDepth and handler */}
      <DebugMenu 
        debugState={debugState} 
        onDebugAction={handleDebugAction} 
      />
      
      {/* Improved adding tile indicator */}
      {addingTile && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-80 text-white px-5 py-3 rounded-full shadow-lg z-20 flex items-center space-x-3">
          <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
          <span className="font-medium">Adding tile to colony...</span>
        </div>
      )}
      
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
        <HexGridCanvas
          wireframe={debugState.wireframe}
          hexSize={debugState.hexSize}
          colorScheme={debugState.colorScheme}
          tileMap={tileMap}
          fogTiles={fogTiles}
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          onTileSelect={handleTileSelect}
          onTileAdd={handleAddTile}
          colonyColor={colony?.color}
        />
      )}
    </div>
  )
} 