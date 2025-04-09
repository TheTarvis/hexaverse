'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useColony } from '@/contexts/ColonyContext'
import { useToast } from '@/contexts/ToastContext'
import { ColonyTile } from '@/types/colony'
import { DebugMenu } from '@/components/grid/DebugMenu'
import { HexGridCanvas } from '@/components/grid/HexGridCanvas'
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
  const { colony, refreshColony } = useColony();
  const { showToast } = useToast();
  
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type', // Default to type-based coloring
    fogDepth: 20, // Add fog depth to debug state
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
  const [fogTiles, setFogTiles] = useState<{q: number, r: number, s: number}[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const [addingTile, setAddingTile] = useState(false)
  
  // Recalculate fog tiles when fog depth changes or tileMap is updated
  useEffect(() => {
    if (Object.keys(tileMap).length > 0) {
      // Find fog tiles based on current depth
      const fogTilesList = findFogTiles(tileMap, debugState.fogDepth);
      console.log(`Found ${fogTilesList.length} potential fog tiles with depth ${debugState.fogDepth}`);
      setFogTiles(fogTilesList);
    }
  }, [tileMap, debugState.fogDepth]); // Only depend on tileMap and fogDepth, not colony

  // Load the initial grid data when colony tiles change
  useEffect(() => {
    async function loadGridData() {
      try {
        setLoading(true);
        
        if (colony && colony.tiles && colony.tiles.length > 0) {
          console.log(`Loading ${colony.tiles.length} tiles from colony`);
          
          const tileMapData: TileMap = {};
          colony.tiles.forEach((tile) => {
            const key = coordsToKey(tile.q, tile.r, tile.s);
            tileMapData[key] = tile;
          });
          
          setTileMap(tileMapData); // This triggers the fog calculation useEffect
          setError(null);
        } else {
          console.log('No colony tiles available');
          setTileMap({});
          setFogTiles([]); // Clear fog tiles if no colony
          showToast('No colony tiles available. Please create a colony first.', 'error');
          setError('No colony tiles available. Please create a colony first.');
        }
      } catch (error) {
        console.error('Error loading grid data:', error);
        showToast('Failed to load grid data', 'error');
        setError('Failed to load grid data');
      } finally {
        setLoading(false);
      }
    }
    
    loadGridData();
  }, [colony?.tiles, showToast]); // Added showToast to dependencies
  
  // Handle adding a tile to the colony
  const handleAddTile = useCallback(async (q: number, r: number, s: number) => {
    if (addingTile) return; // Prevent multiple concurrent requests
    
    try {
      setAddingTile(true);
      console.log(`Adding tile at q=${q}, r=${r}, s=${s} to colony`);
      
      const result = await addTile(q, r, s);
      
      if (result.success && result.tile) {
        // Add the new tile to the local tile map immediately for immediate feedback
        setTileMap(prevTileMap => {
          const key = coordsToKey(q, r, s);
          return {
            ...prevTileMap,
            [key]: result.tile as ColonyTile
          };
        });
        
        // Remove this tile from fog tiles since it's now part of the colony
        setFogTiles(prevFogTiles => 
          prevFogTiles.filter(tile => !(tile.q === q && tile.r === r && tile.s === s))
        );
        
        // Update colony data without triggering a full grid reload
        refreshColony({ silent: true }).catch(err => {
          console.error('Background colony refresh error:', err);
          showToast('Error refreshing colony data', 'error');
        });
        
        // Log success but don't show toast
        if (result.captured) {
          console.log(`Tile captured from another colony!`);
        } else {
          console.log(`New ${result.tile.type} tile added to your colony!`);
        }
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
  }, [addingTile, refreshColony, setFogTiles, showToast]); // Added showToast to dependencies
  
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
          const schemes = ['type', 'resources', 'rainbow', 'default', 'monochrome'];
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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-40 z-10">
          <div className="text-lg font-medium text-gray-700">Loading grid data...</div>
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
      
      {/* Small loading indicator when adding tiles */}
      {addingTile && (
        <div className="absolute bottom-16 right-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-md text-sm z-10">
          Adding tile...
        </div>
      )}
      
      {/* Only render the Canvas when not loading and no errors */}
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
        />
      )}
    </div>
  )
} 