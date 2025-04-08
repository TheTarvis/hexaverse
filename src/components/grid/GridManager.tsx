'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useColony } from '@/contexts/ColonyContext'
import { ColonyTile } from '@/types/colony'
import { DebugMenu } from '@/components/grid/DebugMenu'
import { HexGridCanvas } from '@/components/grid/HexGridCanvas'

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

// Hex directions matching the Go implementation
const HEX_DIRECTIONS = [
  { q: 1, r: -1, s: 0 },  // UpRight
  { q: 0, r: -1, s: 1 },  // Up
  { q: -1, r: 0, s: 1 },  // UpLeft
  { q: -1, r: 1, s: 0 },  // DownLeft
  { q: 0, r: 1, s: -1 },  // Down
  { q: 1, r: 0, s: -1 },  // DownRight
]

// Function to create a unique key for a cube coordinate
function coordsToKey(q: number, r: number, s: number): string {
  return `${q},${r},${s}`
}

export function GridManager() {
  const { colony } = useColony();
  
  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type' // Default to type-based coloring
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
  
  // Load the grid data when colony changes
  useEffect(() => {
    async function loadGridData() {
      try {
        setLoading(true);
        
        // If we have colony tiles, use them
        if (colony && colony.tiles && colony.tiles.length > 0) {
          console.log(`Loading ${colony.tiles.length} tiles from colony`);
          
          // Create a map of cube coordinates to tiles
          const tileMapData: TileMap = {};
          colony.tiles.forEach((tile) => {
            const key = coordsToKey(tile.q, tile.r, tile.s);
            tileMapData[key] = tile;
          });
          
          setTileMap(tileMapData);
          setError(null);
        } else {
          console.log('No colony tiles available');
          setTileMap({});
          setError('No colony tiles available. Please create a colony first.');
        }
      } catch (error) {
        console.error('Error loading grid data:', error);
        setError('Failed to load grid data');
      } finally {
        setLoading(false);
      }
    }
    
    loadGridData();
  }, [colony]);
  
  const handleDebugAction = (action: string) => {
    switch(action) {
      case 'toggleWireframe':
        setDebugState((prev: typeof debugState) => ({ ...prev, wireframe: !prev.wireframe }))
        break
      case 'adjustSize':
        setDebugState((prev: typeof debugState) => ({ 
          ...prev, 
          hexSize: prev.hexSize === 1.2 ? 1.5 : prev.hexSize === 1.5 ? 0.9 : 1.2
        }))
        break
      case 'changeColorScheme':
        setDebugState((prev: typeof debugState) => {
          // Cycle through color schemes
          const schemes = ['type', 'resources', 'rainbow', 'default', 'monochrome'];
          const currentIndex = schemes.indexOf(prev.colorScheme);
          const nextIndex = (currentIndex + 1) % schemes.length;
          return { ...prev, colorScheme: schemes[nextIndex] };
        });
        break;
    }
  }

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Setting selected tile:', tile);
    setSelectedTile(tile);
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
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-100 bg-opacity-40 z-10">
          <div className="text-lg font-medium text-red-700">{error}</div>
        </div>
      )}
      
      {/* Enhanced SlideUpPanel with more tile information */}
      <SlideUpPanel
        isOpen={selectedTile !== null}
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
      
      {/* Debug Menu Component */}
      <DebugMenu debugState={debugState} onDebugAction={handleDebugAction} />
      
      {/* Only render the Canvas when not loading and no errors */}
      {!loading && !error && Object.keys(tileMap).length > 0 && (
        <HexGridCanvas
          wireframe={debugState.wireframe}
          hexSize={debugState.hexSize}
          colorScheme={debugState.colorScheme}
          tileMap={tileMap}
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          onTileSelect={handleTileSelect}
        />
      )}
    </div>
  )
} 