'use client'

import { DebugMenu } from '@/components/grid/DebugMenu'
import { GridCanvas, SelectedTile } from '@/components/grid/GridCanvas'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useAuth } from '@/contexts/AuthContext'
import { ColonyStatus, useColony } from '@/contexts/ColonyContext'
import { ColonyTilesProvider, useColonyTiles } from '@/contexts/ColonyTilesContext'
import { useToast } from '@/contexts/ToastContext'
import { addColonyTile as addColonyTileService, WarmupableFunctions } from '@/services/colony/ColonyTilesService'
import { TileMap } from '@/types/tiles'
import { getTileColor } from '@/utils/tileColorUtils'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWarmupFunctions } from '@/hooks/useWarmupFunctions'
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'
import { COLONY_WEBSOCKET_URL } from '@/services/websocket'

// Inner component that uses the colony context
function ColonyGridInner() {
  const { colony, fetchColonyColor, colonyStatus, isLoadingColony, userColorMap } = useColony()
  const { colonyTiles, viewableTiles, addColonyTile, isLoadingTiles } = useColonyTiles()
  const { showToast } = useToast()
  const { user, isAdmin } = useAuth()
  
  // Setup WebSocket connection with the provided URL
  const { setServerUrl } = useWebSocketSubscription();

  // Set WebSocket server URL only once when component mounts
  useEffect(() => {
    if (COLONY_WEBSOCKET_URL) {
      console.log(`Setting WebSocket base URL for ColonyGrid: ${COLONY_WEBSOCKET_URL}`);
      setServerUrl(COLONY_WEBSOCKET_URL);
    }
  }, [COLONY_WEBSOCKET_URL, setServerUrl]);

  // Warm up cloud functions
  useWarmupFunctions([WarmupableFunctions.addColonyTile])

  const [debugState, setDebugState] = useState({
    wireframe: false,
    hexSize: 1.2,
    colorScheme: 'type', // Default to type-based coloring
    viewDistance: 5, // Controls how many hex layers beyond the colony edge are shown as viewable tiles
    tileDetailsEnabled: false, // Disabled by default
  })

  // Add state to store fetched colors
  const [colorCache, setColorCache] = useState<Record<string, string>>({})

  // Update local color cache when userColorMap changes
  useEffect(() => {
    if (Object.keys(userColorMap).length > 0) {
      setColorCache(prev => ({
        ...prev,
        ...userColorMap
      }));
    }
  }, [userColorMap]);

  // Calculate world coordinates for the target tile based on colony start coordinates
  const worldCoords = useMemo(() => {
    if (!colony?.startCoordinates) {
      return null;
    }

    const { q, r } = colony.startCoordinates
    const worldX = debugState.hexSize * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
    const worldY = debugState.hexSize * ((3 / 2) * r)
    return { x: worldX, y: worldY }
  }, [colony?.startCoordinates, debugState.hexSize])

  // Camera position and target are only calculated if we have colony coordinates
  const cameraProps = useMemo(() => {
    if (!worldCoords) return {};
    
    return {
      cameraPosition: [worldCoords.x, worldCoords.y, 20] as [number, number, number],
      cameraTarget: [worldCoords.x, worldCoords.y, 0] as [number, number, number]
    };
  }, [worldCoords]);

  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const [addingTile, setAddingTile] = useState(false)

  // Compute the tileMap using useMemo based on dependencies
  const tileMap = useMemo(() => {
    // Initialize with viewable tiles, excluding any already in colonyTiles
    const baseMap: TileMap = {}
    Object.entries(viewableTiles)
      .filter(([key]) => !colonyTiles[key])
      .forEach(([key, tile]) => {
        // Get enemy color with validation
        const enemyColor = tile.controllerUid && typeof tile.controllerUid === 'string'
          ? colorCache[tile.controllerUid] || '#FF3333'
          : '#FF3333';
          
        baseMap[key] = {
          ...tile,
          color: getTileColor(tile, user?.uid, {
            colorScheme: debugState.colorScheme,
            colonyColor: colony?.color,
            distance: debugState.viewDistance, 
            enemyColor: enemyColor,
          }),
        }
      })

    // Add or update colony tiles, always recalculating color
    Object.entries(colonyTiles).forEach(([key, tile]) => {
      // Get enemy color with validation
      const enemyColor = tile.controllerUid && typeof tile.controllerUid === 'string'
        ? colorCache[tile.controllerUid] || '#FF3333'
        : '#FF3333';
        
      baseMap[key] = {
        ...tile,
        color: getTileColor(tile, user?.uid, {
          colorScheme: debugState.colorScheme,
          colonyColor: colony?.color,
          distance: debugState.viewDistance,
          enemyColor: enemyColor,
        }),
      }
    })

    return baseMap
  }, [colonyTiles, viewableTiles, debugState, colony?.color, user?.uid, colorCache])

  // Load colors for tiles with controllers
  useEffect(() => {
    const controllerUids = new Set<string>();
    
    // Collect all unique controller UIDs with validation
    Object.values(viewableTiles).forEach(tile => {
      if (tile.controllerUid && 
          typeof tile.controllerUid === 'string' && 
          !colorCache[tile.controllerUid]) {
        controllerUids.add(tile.controllerUid);
      }
    });
    
    Object.values(colonyTiles).forEach(tile => {
      if (tile.controllerUid && 
          typeof tile.controllerUid === 'string' && 
          !colorCache[tile.controllerUid]) {
        controllerUids.add(tile.controllerUid);
      }
    });
    
    // Fetch colors for all controllers in parallel
    const fetchColors = async () => {
      const promises = Array.from(controllerUids).map(async uid => {
        const color = await fetchColonyColor(uid);
        return { uid, color };
      });
      
      const results = await Promise.all(promises);
      
      const newColorCache = { ...colorCache };
      results.forEach(({ uid, color }) => {
        newColorCache[uid] = color;
      });
      
      setColorCache(newColorCache);
    };
    
    if (controllerUids.size > 0) {
      fetchColors();
    }
  }, [viewableTiles, colonyTiles, fetchColonyColor, colorCache]);

  // Handle adding a tile to the colony
  const onAddTile = useCallback(
    async (q: number, r: number, s: number) => {
      try {
        setAddingTile(true)
        console.log(`Adding tile at q=${q}, r=${r}, s=${s} to colony`)

        const result = await addColonyTileService(q, r, s)

        if (!result || !result.success || !result.tile) {
          console.error(`Failed to add tile: ${result.message}`)
          showToast(result.message || 'Failed to add tile', 'error')
          setError(null) // Clear any existing error
          return
        }

        console.log('Adding tile to colony:', result.tile)

        // Update the Tiles Context with the new colony tile.
        addColonyTile(result.tile)
      } catch (error) {
        console.error('Error adding tile:', error)
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
        showToast(errorMessage, 'error')
        setError(null) // Clear any existing error
      } finally {
        setAddingTile(false)
      }
    },
    [addColonyTile, showToast]
  )

  const handleDebugAction = (action: string, value?: any) => {
    switch (action) {
      case 'toggleWireframe':
        setDebugState((prev) => ({ ...prev, wireframe: !prev.wireframe }))
        break
      case 'adjustSize':
        setDebugState((prev) => ({
          ...prev,
          hexSize: prev.hexSize === 1.2 ? 1.5 : prev.hexSize === 1.5 ? 0.9 : 1.2,
        }))
        break
      case 'changeColorScheme':
        setDebugState((prev) => {
          const schemes = ['type', 'resources', 'rainbow', 'colony', 'default', 'monochrome']
          const currentIndex = schemes.indexOf(prev.colorScheme)
          const nextIndex = (currentIndex + 1) % schemes.length
          return { ...prev, colorScheme: schemes[nextIndex] }
        })
        break
      case 'changeViewDepth': // Add case for changing view depth
        if (typeof value === 'number' && value >= 0) {
          setDebugState((prev) => ({ ...prev, viewDistance: value }))
        }
        break
      case 'toggleTileDetails': // Add case for toggling tile details
        setDebugState((prev) => ({ ...prev, tileDetailsEnabled: !prev.tileDetailsEnabled }))
        // If disabling and a tile is selected, close the panel
        if (debugState.tileDetailsEnabled && selectedTile) {
          setSelectedTile(null)
        }
        break
    }
  }

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Setting selected tile:', tile)
    // Only set the selected tile if tile details are enabled
    if (debugState.tileDetailsEnabled) {
      setSelectedTile(tile)
    } else {
      console.log('Tile details are disabled. Enable in debug menu to see details.')
    }
  }

  const closePanel = () => {
    setSelectedTile(null)
  }

  return (
    <div className="relative h-full w-full">
      {(isLoadingColony || isLoadingTiles) && (
        <div className="bg-opacity-70 absolute inset-0 z-10 flex h-screen items-center justify-center bg-white dark:bg-zinc-950">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-indigo-500"></div>
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
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Cube Coordinates</div>
              <div className="mt-1 font-mono dark:text-gray-200">
                q: {selectedTile.q}, r: {selectedTile.r}, s: {selectedTile.s}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</div>
              <div className="mt-1 flex items-center">
                <div className="mr-2 h-6 w-6 rounded" style={{ backgroundColor: selectedTile.color }}></div>
                <code className="text-xs dark:text-gray-200">{selectedTile.color}</code>
              </div>
            </div>
            {selectedTile.type && (
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Tile Type</div>
                <div className="mt-1 dark:text-gray-200">{selectedTile.type}</div>
              </div>
            )}
            {selectedTile.resourceDensity !== undefined && (
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Resource Density</div>
                <div className="mt-1 dark:text-gray-200">{Math.round(selectedTile.resourceDensity * 100)}%</div>
              </div>
            )}
          </div>
        )}
      </SlideUpPanel>

      {/* Debug Menu Component - only show for admin users */}
      {isAdmin && <DebugMenu debugState={debugState} onDebugAction={handleDebugAction} />}

      {/* Show error message if there's an error and we're not loading */}
      {error && colonyStatus !== ColonyStatus.LOADING && (
        <div className="bg-opacity-40 absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
          <div className="max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-gray-800">
            <h3 className="mb-2 text-lg font-medium text-red-600 dark:text-red-400">Error</h3>
            <p className="text-gray-700 dark:text-gray-300">{error}</p>
          </div>
        </div>
      )}

      {/* Only render the Canvas when not loading, no errors, and we have tiles */}
      {Object.keys(tileMap).length > 0 && (
        <GridCanvas
          wireframe={debugState.wireframe}
          hexSize={debugState.hexSize}
          tileMap={tileMap}
          {...cameraProps}
          onTileSelect={handleTileSelect}
          onTileAdd={onAddTile}
          onCameraStop={(pos) => {}} // Empty handler to satisfy the interface
        />
      )}
    </div>
  )
}

// Outer component that provides the context
export function ColonyGridManager() {
  return (
    <ColonyTilesProvider>
      <ColonyGridInner />
    </ColonyTilesProvider>
  )
}
