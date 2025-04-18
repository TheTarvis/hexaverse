'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useColony } from '@/contexts/ColonyContext'
import { clearAllTileCache, fetchTiles, updateTileCache } from '@/services/tiles'
import { Tile, TileMap, toTileMap } from '@/types/tiles'
import { isTileMessage, WebSocketMessage } from '@/types/websocket'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { findViewableTiles } from '@/utils/hexUtils'
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'
import { removeColonyCacheWithTile } from '@/services/colony'

interface TileContextType {
  isLoadingTiles: boolean
  colonyTiles: TileMap
  viewableTiles: TileMap
  addColonyTile: (tile: Tile) => void
  removeColonyTile: (tile: Tile) => void
}

const TileContext = createContext<TileContextType | undefined>(undefined)

export function TileProvider({ children }: { children: ReactNode }) {
  // TODO TW: Set is loading tiles at some point, not critical just UX
  const [isLoadingTiles, setIsLoadingTiles] = useState(false)
  const { colony, fetchColonyColor, setColony } = useColony()
  const { user } = useAuth()
  const [colonyTiles, setColonyTiles] = useState<TileMap>({})
  const [viewableTiles, setViewableTiles] = useState<TileMap>({})

  const addColonyTile = useCallback(
    (tile: Tile) => {
      // Add to colony tiles
      setColonyTiles((prev) => ({
        ...prev,
        ...toTileMap([tile]),
      }))

      //  Update viewable tiles off of tile change.
      let tilesMap = toTileMap([tile])
      let newlyViewableTiles: TileMap = Object.fromEntries(
        Object.entries(findViewableTiles(tilesMap, 5))
          .filter(([_, neighborTile]) => !(neighborTile.id in colonyTiles))
          .filter(([_, neighborTile]) => !(neighborTile.id in viewableTiles))
      )

      // If there are new viewable tiles, fetch their actual data
      const newViewableTileIds = Object.keys(newlyViewableTiles)
      if (newViewableTileIds.length > 0) {
        console.log(`Found ${newViewableTileIds.length} newly viewable tiles, fetching data...`)

        // First, add the placeholder tiles to the viewable tiles state
        setViewableTiles((prev) => ({
          ...prev,
          ...newlyViewableTiles,
        }))

        // Then, fetch the actual tile data asynchronously
        ;(async () => {
          try {
            const fetchedTiles = await fetchTiles(newViewableTileIds)
            console.log(`Fetched ${fetchedTiles.length} newly viewable tiles`)

            // Update the viewable tiles state with the actual data
            setViewableTiles((prev) => ({
              ...prev,
              ...toTileMap(fetchedTiles),
            }))
          } catch (error) {
            console.error('Error fetching newly viewable tiles:', error)
          }
        })()
      }
    },
    [colonyTiles, viewableTiles, setColonyTiles, setViewableTiles]
  )

  const removeColonyTile = useCallback(
    (tile: Tile) => {
      // Remove the tile from colonyTiles
      const updatedColonyTiles = { ...colonyTiles }
      delete updatedColonyTiles[tile.id]
      setColonyTiles(updatedColonyTiles)

      // Add the removed tile to viewableTiles
      setViewableTiles(prev => ({
        ...prev,
        [tile.id]: tile
      }))

      //  Update viewable tiles off of tile change.
      let tilesMap = toTileMap([tile])
      let newlyViewableTiles: TileMap = Object.fromEntries(
        Object.entries(findViewableTiles(tilesMap, 5))
          .filter(([_, neighborTile]) => !(neighborTile.id in colonyTiles))
          .filter(([_, neighborTile]) => !(neighborTile.id in viewableTiles))
      )

      // If there are new viewable tiles, fetch their actual data
      const newViewableTileIds = Object.keys(newlyViewableTiles)
      if (newViewableTileIds.length > 0) {
        console.log(`Found ${newViewableTileIds.length} newly viewable tiles, fetching data...`)

        // First, add the placeholder tiles to the viewable tiles state
        setViewableTiles((prev) => ({
          ...prev,
          ...newlyViewableTiles,
        }))

        // Then, fetch the actual tile data asynchronously
        ;(async () => {
          try {
            const fetchedTiles = await fetchTiles(newViewableTileIds)
            console.log(`Fetched ${fetchedTiles.length} newly viewable tiles`)

            // Update the viewable tiles state with the actual data
            setViewableTiles((prev) => ({
              ...prev,
              ...toTileMap(fetchedTiles),
            }))
          } catch (error) {
            console.error('Error fetching newly viewable tiles:', error)
          }
        })()
      }
    },
    [colonyTiles, viewableTiles, setColonyTiles, setViewableTiles]
  )

  const value = {
    isLoadingTiles,
    colonyTiles,
    viewableTiles,
    addColonyTile,
    removeColonyTile,
  }

  // Handle colony tile changes.
  useEffect(() => {
    ;(async () => {
      if (!colony || !colony.tileIds || colony.tileIds.length <= 0) {
        console.log('Colony has no tileIds')
        return
      }

      // Set loading state to true when starting to fetch tiles
      setIsLoadingTiles(true)

      try {
        const tiles = await fetchTiles(colony.tileIds)
        console.log(colony.tileIds)
        let tilesMap = toTileMap(tiles)

        // 1. Calculate the initial viewable tiles map (with default unexplored structure)
        let initialViewableTiles = findViewableTiles(tilesMap, 5)
        console.log(`Calculated ${Object.keys(initialViewableTiles).length} initial viewable tiles.`)

        // 2. Set initial colony and viewable tiles state immediately
        if (tiles.length > 0) {
          console.log(`Loaded ${tiles.length} tiles for the colony`)
          setColonyTiles(tilesMap)
          setViewableTiles(initialViewableTiles) // Set the default viewable tiles first
        }

        // 3. Start fetching actual data for viewable tiles asynchronously
        const loadViewableTiles = async () => {
          const viewableTileIds = Object.keys(initialViewableTiles)
          if (viewableTileIds.length === 0) {
            setIsLoadingTiles(false) // No viewable tiles to load, so we're done
            return
          }

          console.log(`Starting async fetch for ${viewableTileIds.length} viewable tiles...`)
          try {
            clearAllTileCache()

            const fetchedViewableTiles = await fetchTiles(viewableTileIds)
            console.log(`Async fetch completed for ${fetchedViewableTiles.length} viewable tiles.`)

            // Update the cache with fresh data
            updateTileCache(fetchedViewableTiles)

            // 4. Update viewable tiles state with fetched data
            const fetchedViewableMap = toTileMap(fetchedViewableTiles)
            setViewableTiles((prev) => ({
              ...prev, // Keep existing state (might have changed via WS)
              ...fetchedViewableMap, // Overwrite with newly fetched data
            }))

            // Set loading to false once all data is loaded
            setIsLoadingTiles(false)
          } catch (error) {
            console.error('Error fetching viewable tiles asynchronously:', error)
            setIsLoadingTiles(false) // Set loading to false even if there's an error
          }
        }

        loadViewableTiles()
      } catch (tileError) {
        console.error('Error loading colony tiles:', tileError)
        setIsLoadingTiles(false) // Set loading to false if there's an error
      }
    })()
  }, [colony])

  // Subscribe to WebSocket messages for tile updates
  useWebSocketSubscription({
    onMessage: async (data: WebSocketMessage) => {
      // Handle tile updates
      if (isTileMessage(data) && data.payload) {
        const tile = data.payload
        updateTileCache(tile)
        console.log(`WebSocket: Received tile update for tile at ${tile.q},${tile.r},${tile.s}`, tile)

        // If the tile.controllerUid == user.id update colony tiles
        if (user && tile.controllerUid == user.uid) {
          addColonyTile(tile)
          return
        }

        if (viewableTiles[tile.id]) {
          console.log('Tile is in the viewable map')
          setViewableTiles((prev) => ({
            ...prev,
            ...toTileMap([tile]),
          }))
        }

        // If it is controlled by another player
        if (user && tile.controllerUid && tile.controllerUid !== user.uid && colonyTiles[tile.id]) {
          console.log('Tile is in the colony map')
          removeColonyTile(tile)
          // Only update the cache - do NOT update colony state directly
          // This avoids triggering a colony state change which causes grid reloading
          if (user && user.uid) {
            await removeColonyCacheWithTile(user.uid, tile.id);
          }
          // Get the colony color using the context function instead of direct API call
          await fetchColonyColor(tile.controllerUid)
        }


      }
    },
  })

  return <TileContext.Provider value={value}>{children}</TileContext.Provider>
}

export function useTiles() {
  const context = useContext(TileContext)
  if (context === undefined) {
    throw new Error('useTiles must be used within a TileProvider')
  }
  return context
}
