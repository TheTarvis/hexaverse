'use client'

import { DebugMenu } from '@/components/grid/DebugMenu'
import { GridCanvas } from '@/components/grid/GridCanvas'
import { SlideUpPanel } from '@/components/slide-up-panel'
import { useAuth } from '@/contexts/AuthContext'
import { ColonyStatus, useColony } from '@/contexts/ColonyContext'
import { useTiles } from '@/contexts/TileContext'
import { useToast } from '@/contexts/ToastContext'
import { addTile } from '@/services/tiles'
import { Tile, TileMap } from '@/types/tiles'
import { coordsToKey } from '@/utils/hexUtils'
import { getTileColor } from '@/utils/tileColorUtils'
import { useCallback, useEffect, useMemo, useState } from 'react'

// Add an interface for the selected tile
interface SelectedTile {
  q: number
  r: number
  s: number
  color: string
  type?: string
  resourceDensity?: number
}

export function GridManager() {
  const { colony, setColony, colonyStatus, isLoadingColony } = useColony()
  const { colonyTiles, viewableTiles, addColonyTile } = useTiles()
  const { showToast } = useToast()
  const { user } = useAuth()

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
      return { x: 0, y: 0 }
    }

    const { q, r } = colony.startCoordinates
    const worldX = debugState.hexSize * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
    const worldY = debugState.hexSize * ((3 / 2) * r)
    return { x: worldX, y: worldY }
  }, [colony?.startCoordinates, debugState.hexSize])

  // Camera will be positioned directly above the target
  const cameraPosition: [number, number, number] = [worldCoords.x, worldCoords.y, 20]
  const cameraTarget: [number, number, number] = [worldCoords.x, worldCoords.y, 0]

  const [tileMap, setTileMap] = useState<TileMap>({})

  const [error, setError] = useState<string | null>(null)
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null)
  const [addingTile, setAddingTile] = useState(false)

  // Update colony tiles colors when colorScheme, colony color or the colony tiles change.
  useEffect(() => {
    if (Object.keys(colonyTiles).length === 0) return

    const updatedTileMap = { ...colonyTiles }
    let hasChanges = false

    console.log('Colony tiles changed. Attempting to recolor')
    console.log(colony?.color)

    // Update colors for all tiles based on current settings
    Object.entries(updatedTileMap).forEach(([key, tile]) => {
      const newColor = getTileColor(tile, user?.uid, {
        colorScheme: debugState.colorScheme,
        colonyColor: colony?.color,
        distance: 5, // optional
      })

      // Only update if color has changed
      if (tile.color !== newColor) {
        updatedTileMap[key] = {
          ...tile,
          color: newColor,
        }
        hasChanges = true
      }
    })

    // Only update state if colors have actually changed
    if (hasChanges) {
      setTileMap((prev) => {
        if (!prev) return updatedTileMap
        return {
          ...prev,
          ...updatedTileMap,
        }
      })
    }
  }, [debugState.colorScheme, colony?.color, colonyTiles, user?.uid])

  // Update viewable tiles colors when colorScheme, colony color or the viewable tiles change.
  useEffect(() => {
    if (Object.keys(viewableTiles).length === 0) return

    const tilesToUpdate: Record<string, Tile> = {}
    let hasChanges = false

    console.log('Viewable tiles changed. Attempting to recolor')

    // Update colors for all tiles based on current settings
    Object.entries(viewableTiles)
      .filter(([_, tile]) => !(tile.id in colonyTiles))
      .forEach(([key, tile]) => {
        const newColor = getTileColor(tile, user?.uid, {
          colorScheme: debugState.colorScheme,
          colonyColor: colony?.color,
          distance: 5, // optional
        })

        // Only update if color has changed
        if (tile.color !== newColor) {
          tilesToUpdate[key] = {
            ...tile,
            color: newColor,
          }
          hasChanges = true
        }
      })

    // Only update state if colors have actually changed
    if (hasChanges) {
      setTileMap((prev) => {
        if (!prev) return { ...viewableTiles, ...tilesToUpdate }
        return {
          ...prev,
          ...tilesToUpdate,
        }
      })
    }
  }, [colony?.color, colonyTiles, debugState.colorScheme, user?.uid, viewableTiles])

  // Handle adding a tile to the colony
  const handleAddTile = useCallback(
    async (q: number, r: number, s: number) => {
      try {
        setAddingTile(true)
        console.log(`Adding tile at q=${q}, r=${r}, s=${s} to colony`)

        const result = await addTile(q, r, s)

        if (! result || !result.success || !result.tile) {
          console.error(`Failed to add tile: ${result.message}`)
          showToast(result.message || 'Failed to add tile', 'error')
          setError(null) // Clear any existing error
          return
        }

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
      case 'toggleCameraFollow': // Add case for toggling camera follow mode
        setDebugState((prev) => ({ ...prev, followSelectedTile: !prev.followSelectedTile }))
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
      {isLoadingColony && (
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

      {/* Debug Menu Component - pass view depth and handler */}
      <DebugMenu debugState={debugState} onDebugAction={handleDebugAction} />

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
